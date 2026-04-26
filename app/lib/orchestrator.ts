// app/lib/orchestrator.ts
//
// Pure-TS pair-review dance. The React page (app/pages/index.tsx) calls
// this; tests call this directly with mocked dependencies. No browser-only
// APIs here so vitest can exercise the full path.
//
// Flow:
//   1. Run Proposer agent -> {request, proposerSig, rationale, meta}
//   2. Run Reviewer agent with ONLY the structured request -> approve|reject
//   3. Build the evidence bundle (proposer rationale + reviewer rationale +
//      metadata). Pin to IPFS.
//   4. Return either an "executable" or "rejected" bundle for the caller
//      to submit on-chain.

import { type Address, type Hex } from "viem";
import { runProposer, type LLMProvider } from "../agents/proposer";
import { runReviewer, type ReviewerOutput } from "../agents/reviewer";
import type { AgentRequest } from "./eip712";
import type { ProposerInput, ReviewerInput, ReviewerPolicy, ToolDescriptor } from "./types";
import {
  evidenceHash as computeEvidenceHash,
  type EvidenceBundle,
  type IPFSPinner,
} from "./ipfs";

export interface OrchestratorInputs {
  intent: string;
  toolCatalog: ToolDescriptor[];
  pairNonce: bigint;
  proposerId: bigint;
  reviewerId: bigint;
  proposerKey: Hex;
  reviewerKey: Hex;
  proposerLLM: LLMProvider;
  reviewerLLM: LLMProvider;
  policy: ReviewerPolicy;
  gateAddress: Address;
  chainId: number;
  ipfs: IPFSPinner;
  /// Seconds from now until the request becomes invalid. Default 1 hour.
  deadlineDelta?: bigint;
  /// Optional custom contextHash. Default keccak256(intent + capturedAt).
  contextHash?: Hex;
}

export interface OrchestratorExecutable {
  kind: "executable";
  request: AgentRequest;
  proposerSig: Hex;
  reviewerSig: Hex;
  evidenceURI: string;
  evidenceHash: Hex;
  bundle: EvidenceBundle;
}

export interface OrchestratorRejected {
  kind: "rejected";
  request: AgentRequest;
  proposerSig: Hex; // we still committed proposer to the payload
  reasonCode: number;
  reason: string;
  evidenceURI: string;
  evidenceHash: Hex;
  bundle: EvidenceBundle;
}

export type OrchestratorOutput = OrchestratorExecutable | OrchestratorRejected;

export async function runPairReview(args: OrchestratorInputs): Promise<OrchestratorOutput> {
  const capturedAt = new Date().toISOString();
  const deadlineDelta = args.deadlineDelta ?? 3600n;
  const deadline = BigInt(Math.floor(Date.now() / 1000)) + deadlineDelta;
  const contextHash = args.contextHash ?? hashContext(args.intent, capturedAt);

  // 1. Proposer
  const proposerInput: ProposerInput = {
    intent: args.intent,
    toolCatalog: args.toolCatalog,
    pairNonce: args.pairNonce,
    proposerId: args.proposerId,
    reviewerId: args.reviewerId,
    gateAddress: args.gateAddress,
    chainId: args.chainId,
  };
  const prop = await runProposer({
    llm: args.proposerLLM,
    signerKey: args.proposerKey,
    input: proposerInput,
    deadline,
    contextHash,
  });

  // 2. Reviewer (sanitized — gets ONLY the structured request)
  const reviewerInput: ReviewerInput = {
    request: prop.request,
    policy: args.policy,
    gateAddress: args.gateAddress,
    chainId: args.chainId,
  };
  const rev: ReviewerOutput = await runReviewer({
    llm: args.reviewerLLM,
    signerKey: args.reviewerKey,
    input: reviewerInput,
  });

  // 3. Build evidence bundle (rationales + metadata).
  const bundle: EvidenceBundle = {
    request: serializeRequest(prop.request),
    proposer: {
      rationale: prop.rationale,
      provider: prop.meta.provider,
      model: prop.meta.model,
      selectedTool: prop.meta.selectedTool,
    },
    reviewer: rev.ok
      ? {
          rationale: rev.rationale,
          provider: rev.meta.provider,
          model: rev.meta.model,
          decision: "approve",
        }
      : {
          rationale: rev.reason,
          provider: rev.meta.provider,
          model: rev.meta.model,
          decision: "reject",
          reasonCode: rev.reasonCode,
        },
    context: {
      capturedAt,
      chainId: args.chainId,
      gateAddress: args.gateAddress,
    },
  };
  const evidenceURI = await args.ipfs.pinJSON(bundle);
  const evidenceHash = computeEvidenceHash(bundle);

  // 4. Output
  if (rev.ok) {
    return {
      kind: "executable",
      request: prop.request,
      proposerSig: prop.signature,
      reviewerSig: rev.signature,
      evidenceURI,
      evidenceHash,
      bundle,
    };
  }
  return {
    kind: "rejected",
    request: prop.request,
    proposerSig: prop.signature,
    reasonCode: rev.reasonCode,
    reason: rev.reason,
    evidenceURI,
    evidenceHash,
    bundle,
  };
}

function hashContext(intent: string, capturedAt: string): Hex {
  // keccak256(utf8(intent || "|" || capturedAt))
  const enc = new TextEncoder().encode(`${intent}|${capturedAt}`);
  // Use a quick keccak via viem-style helper: import lazily to avoid pulling
  // heavy deps into typecheck order.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { keccak256, bytesToHex } = require("viem") as typeof import("viem");
  return keccak256(bytesToHex(enc));
}

function serializeRequest(r: AgentRequest) {
  return {
    proposerId: r.proposerId.toString(),
    reviewerId: r.reviewerId.toString(),
    target: r.target,
    value: r.value.toString(),
    data: r.data,
    nonce: r.nonce.toString(),
    deadline: r.deadline.toString(),
    contextHash: r.contextHash,
  };
}
