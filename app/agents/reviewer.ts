// app/agents/reviewer.ts
//
// Reviewer agent runner. Hard rules:
//  - Receives ONLY the structured AgentRequest. No Proposer rationale, no
//    transcript. (CLAUDE.md Rule 3 + ARCHITECTURE.md §3.)
//  - Loads policy from app/agents/policies/default.json.
//  - Uses LLM provider B (different from Proposer in production).
//  - Returns either a signature or a rejection with reasonCode.
//
// Two-layer review:
//   1. Deterministic policy gate (target allowlist, max value, selector allowlist).
//      Cheap, can't be jailbroken.
//   2. LLM "is this safe?" sanity check on the structured request.
//      Catches semantic-level red flags policy can't express.

import type { Address, Hex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { AGENT_REQUEST_TYPES, buildDomain, type AgentRequest } from "../lib/eip712";
import type { ReviewerInput, ReviewerPolicy } from "../lib/types";
import type { LLMProvider } from "./proposer";

export enum ReviewerReasonCode {
  None = 0,
  TargetNotAllowed = 1,
  ValueOverCap = 2,
  SelectorNotAllowed = 3,
  LLMRejected = 4,
  PolicyMalformed = 5,
}

export type ReviewerOutput =
  | { ok: true; signature: Hex; rationale: string; meta: ReviewerMeta }
  | {
      ok: false;
      reasonCode: ReviewerReasonCode;
      reason: string;
      meta: ReviewerMeta;
    };

export interface ReviewerMeta {
  provider: string;
  model: string;
}

export interface LLMVerdict {
  approve: boolean;
  rationale: string;
}

export async function runReviewer(args: {
  llm: LLMProvider;
  signerKey: Hex;
  input: ReviewerInput;
}): Promise<ReviewerOutput> {
  const meta: ReviewerMeta = { provider: args.llm.provider, model: args.llm.model };

  // 1. Policy gate (deterministic).
  const policyVerdict = checkPolicy(args.input.request, args.input.policy);
  if (policyVerdict.reasonCode !== ReviewerReasonCode.None) {
    return { ok: false, reasonCode: policyVerdict.reasonCode, reason: policyVerdict.reason, meta };
  }

  // 2. LLM sanity check.
  const prompt = renderPrompt(args.input.request, args.input.policy);
  const raw = await args.llm.complete(prompt);
  const verdict = parseVerdict(raw);
  if (!verdict.approve) {
    return {
      ok: false,
      reasonCode: ReviewerReasonCode.LLMRejected,
      reason: verdict.rationale,
      meta,
    };
  }

  // 3. Sign.
  const account: PrivateKeyAccount = privateKeyToAccount(args.signerKey);
  const signature = await account.signTypedData({
    domain: buildDomain(args.input.chainId, args.input.gateAddress),
    types: AGENT_REQUEST_TYPES,
    primaryType: "AgentRequest",
    message: args.input.request,
  });

  return { ok: true, signature, rationale: verdict.rationale, meta };
}

function checkPolicy(
  req: AgentRequest,
  policy: ReviewerPolicy,
): { reasonCode: ReviewerReasonCode; reason: string } {
  // Target allowlist (case-insensitive comparison).
  if (policy.allowedTargets.length > 0) {
    const targetLower = req.target.toLowerCase();
    const matched = policy.allowedTargets.some(
      (t) => t.toLowerCase() === targetLower,
    );
    if (!matched) {
      return {
        reasonCode: ReviewerReasonCode.TargetNotAllowed,
        reason: `target ${req.target} not in policy allowlist`,
      };
    }
  }

  // Value cap.
  if (req.value > policy.maxValueWei) {
    return {
      reasonCode: ReviewerReasonCode.ValueOverCap,
      reason: `value ${req.value} exceeds policy cap ${policy.maxValueWei}`,
    };
  }

  // Selector allowlist (first 4 bytes of req.data).
  if (policy.allowedSelectors.length > 0) {
    if (req.data.length < 10) {
      // No selector available; reject by default.
      return {
        reasonCode: ReviewerReasonCode.SelectorNotAllowed,
        reason: `req.data has no 4-byte selector`,
      };
    }
    const selector = req.data.slice(0, 10).toLowerCase() as Hex;
    const matched = policy.allowedSelectors.some(
      (s) => s.toLowerCase() === selector,
    );
    if (!matched) {
      return {
        reasonCode: ReviewerReasonCode.SelectorNotAllowed,
        reason: `selector ${selector} not in policy allowlist`,
      };
    }
  }

  return { reasonCode: ReviewerReasonCode.None, reason: "" };
}

function renderPrompt(req: AgentRequest, policy: ReviewerPolicy): string {
  return [
    `You are the Reviewer agent in a 2-of-2 ERC-8004 pair-review gate.`,
    `You receive ONLY the structured request below — no rationale or transcript.`,
    `Decide whether this request is safe to execute. Return strict JSON:`,
    `{"approve": true|false, "rationale": "<why>"}`,
    ``,
    `Structured request:`,
    `  proposerId: ${req.proposerId}`,
    `  reviewerId: ${req.reviewerId}`,
    `  target: ${req.target}`,
    `  value: ${req.value}`,
    `  data: ${req.data}`,
    `  nonce: ${req.nonce}`,
    `  deadline: ${req.deadline}`,
    `  contextHash: ${req.contextHash}`,
    ``,
    `Policy in force:`,
    `  maxValueWei: ${policy.maxValueWei}`,
    `  allowedTargets: ${JSON.stringify(policy.allowedTargets)}`,
    `  allowedSelectors: ${JSON.stringify(policy.allowedSelectors)}`,
  ].join("\n");
}

function parseVerdict(raw: string): LLMVerdict {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch (err) {
    throw new Error(`Reviewer LLM returned non-JSON: ${(err as Error).message}`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Reviewer LLM JSON must be an object");
  }
  const p = parsed as Record<string, unknown>;
  if (typeof p.approve !== "boolean") {
    throw new Error(`Reviewer LLM JSON must have boolean "approve"`);
  }
  if (typeof p.rationale !== "string") {
    throw new Error(`Reviewer LLM JSON must have string "rationale"`);
  }
  return { approve: p.approve, rationale: p.rationale };
}

export function loadPolicyFromJson(raw: {
  allowedTargets: string[];
  maxValueWei: string;
  allowedSelectors: string[];
  maxRequestsPerMinute?: number;
}): ReviewerPolicy {
  return {
    allowedTargets: raw.allowedTargets as Address[],
    maxValueWei: BigInt(raw.maxValueWei),
    allowedSelectors: raw.allowedSelectors as Hex[],
    maxRequestsPerMinute: raw.maxRequestsPerMinute ?? 10,
  };
}
