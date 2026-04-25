// app/lib/types.ts
import type { Address, Hex } from "viem";

export type AgentDecision =
  | { ok: true; signature: Hex; rationale: string }
  | { ok: false; reasonCode: number; rationale: string };

export type ProposerInput = {
  intent: string;
  toolCatalog: ToolDescriptor[];
  pairNonce: bigint;
  proposerId: bigint;
  reviewerId: bigint;
  gateAddress: Address;
  chainId: number;
};

export type ReviewerInput = {
  // NOTE: Reviewer never sees Proposer's rationale or transcript.
  // Only the structured request and the same context hash the Proposer signed.
  request: import("./eip712").AgentRequest;
  policy: ReviewerPolicy;
  gateAddress: Address;
  chainId: number;
};

export type ToolDescriptor = {
  name: string;
  description: string;
  selector: Hex;
  target: Address;
};

export type ReviewerPolicy = {
  allowedTargets: Address[];
  maxValueWei: bigint;
  allowedSelectors: Hex[];
  maxRequestsPerMinute: number;
};
