// app/agents/proposer.ts
//
// Proposer agent runner. The Proposer takes a user intent + a tool catalog,
// asks an LLM to choose a structured action, builds an EIP-712 AgentRequest,
// and signs it with the operator key.
//
// CRITICAL CLAUDE.md Rule 3 invariant: the Reviewer MUST receive only the
// structured AgentRequest, never this rationale. runProposer returns the
// rationale separately so the caller (orchestrator) can pin it to IPFS as
// evidence WITHOUT forwarding it to the Reviewer agent.

import type { Address, Hex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import type { AgentRequest } from "../lib/eip712";
import { AGENT_REQUEST_TYPES, buildDomain } from "../lib/eip712";
import type { ProposerInput, ToolDescriptor } from "../lib/types";

/// Pluggable LLM provider abstraction. Production builds inject the real
/// provider (Anthropic/OpenAI/local), tests inject a deterministic mock.
export interface LLMProvider {
  complete(prompt: string): Promise<string>;
  readonly provider: string;
  readonly model: string;
}

/// What the LLM is expected to return as JSON. Strict shape; if the LLM
/// hallucinates something else we throw.
export interface ProposalCandidate {
  selectedTool: string;
  target: Address;
  value: string; // bigint as decimal string
  data: Hex;
  rationale: string;
}

export interface ProposerOutput {
  request: AgentRequest;
  signature: Hex;
  /// Free-form text explaining the choice. Pinned to IPFS as evidence by
  /// the orchestrator. NEVER pass this to the Reviewer.
  rationale: string;
  /// Diagnostic metadata for the evidence bundle.
  meta: {
    provider: string;
    model: string;
    selectedTool: string;
  };
}

export async function runProposer(
  args: {
    llm: LLMProvider;
    signerKey: Hex;
    input: ProposerInput;
    deadline: bigint;
    contextHash: Hex;
  },
): Promise<ProposerOutput> {
  const prompt = renderPrompt(args.input);
  const raw = await args.llm.complete(prompt);
  const candidate = parseCandidate(raw, args.input.toolCatalog);

  const request: AgentRequest = {
    proposerId: args.input.proposerId,
    reviewerId: args.input.reviewerId,
    target: candidate.target,
    value: BigInt(candidate.value),
    data: candidate.data,
    nonce: args.input.pairNonce,
    deadline: args.deadline,
    contextHash: args.contextHash,
  };

  const account: PrivateKeyAccount = privateKeyToAccount(args.signerKey);
  const signature = await account.signTypedData({
    domain: buildDomain(args.input.chainId, args.input.gateAddress),
    types: AGENT_REQUEST_TYPES,
    primaryType: "AgentRequest",
    message: request,
  });

  return {
    request,
    signature,
    rationale: candidate.rationale,
    meta: {
      provider: args.llm.provider,
      model: args.llm.model,
      selectedTool: candidate.selectedTool,
    },
  };
}

function renderPrompt(input: ProposerInput): string {
  const toolList = input.toolCatalog
    .map(
      (t) =>
        `- ${t.name} @ ${t.target} (selector ${t.selector}): ${t.description}`,
    )
    .join("\n");

  return [
    `You are the Proposer agent in a 2-of-2 ERC-8004 pair-review gate.`,
    `User intent: ${input.intent}`,
    ``,
    `Available tools:`,
    toolList || "(none)",
    ``,
    `Choose ONE tool. Return strict JSON of shape:`,
    `{"selectedTool": "<name>", "target": "<0x address>", "value": "<wei as decimal string>", "data": "<0x calldata>", "rationale": "<why>"}`,
    `Do not wrap in markdown. Do not include any other text.`,
  ].join("\n");
}

function parseCandidate(
  raw: string,
  toolCatalog: ToolDescriptor[],
): ProposalCandidate {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch (err) {
    throw new Error(`Proposer LLM returned non-JSON: ${(err as Error).message}`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Proposer LLM JSON must be an object");
  }
  const p = parsed as Record<string, unknown>;
  for (const key of ["selectedTool", "target", "value", "data", "rationale"]) {
    if (typeof p[key] !== "string") {
      throw new Error(`Proposer LLM JSON missing string field "${key}"`);
    }
  }

  const candidate: ProposalCandidate = {
    selectedTool: p.selectedTool as string,
    target: (p.target as string) as Address,
    value: p.value as string,
    data: (p.data as string) as Hex,
    rationale: p.rationale as string,
  };

  // Sanity: selectedTool must be in the catalog (loose check on name).
  if (toolCatalog.length > 0) {
    const known = toolCatalog.find((t) => t.name === candidate.selectedTool);
    if (!known) {
      throw new Error(
        `Proposer chose unknown tool "${candidate.selectedTool}" not in catalog`,
      );
    }
  }
  return candidate;
}
