// app/lib/contracts.ts
//
// PairReviewGate ABI snippet + viem helpers. The gate is the only contract
// the frontend calls directly; ValidationAdapterV1 / ValidationRegistryV0
// are reachable via Validation event scans but never called from here.

import {
  encodeFunctionData,
  parseAbi,
  parseAbiItem,
  type Address,
  type Hex,
  type Log,
} from "viem";
import type { AgentRequest } from "./eip712";

export const PAIR_REVIEW_GATE_ABI = parseAbi([
  // execute
  "function execute((uint256 proposerId,uint256 reviewerId,address target,uint256 value,bytes data,uint256 nonce,uint256 deadline,bytes32 contextHash) req, bytes proposerSig, bytes reviewerSig, string evidenceURI, bytes32 evidenceHash) external payable returns (bytes)",
  // postRejection
  "function postRejection((uint256 proposerId,uint256 reviewerId,address target,uint256 value,bytes data,uint256 nonce,uint256 deadline,bytes32 contextHash) req, bytes proposerSig, uint8 reason, string evidenceURI, bytes32 evidenceHash) external",
  // views
  "function nonceOf(uint256 proposerId, uint256 reviewerId) view returns (uint256)",
  "function digestOf((uint256 proposerId,uint256 reviewerId,address target,uint256 value,bytes data,uint256 nonce,uint256 deadline,bytes32 contextHash) req) view returns (bytes32)",
  "function domainSeparator() view returns (bytes32)",
  // events
  "event Executed(uint256 indexed proposerId, uint256 indexed reviewerId, bytes32 indexed requestHash, address target, uint256 value, bytes returnData)",
  "event Rejected(uint256 indexed proposerId, uint256 indexed reviewerId, bytes32 indexed requestHash, uint8 reason, string evidenceURI)",
]);

export function encodeExecuteCalldata(args: {
  request: AgentRequest;
  proposerSig: Hex;
  reviewerSig: Hex;
  evidenceURI: string;
  evidenceHash: Hex;
}): Hex {
  return encodeFunctionData({
    abi: PAIR_REVIEW_GATE_ABI,
    functionName: "execute",
    args: [
      {
        proposerId: args.request.proposerId,
        reviewerId: args.request.reviewerId,
        target: args.request.target,
        value: args.request.value,
        data: args.request.data,
        nonce: args.request.nonce,
        deadline: args.request.deadline,
        contextHash: args.request.contextHash,
      },
      args.proposerSig,
      args.reviewerSig,
      args.evidenceURI,
      args.evidenceHash,
    ],
  });
}

export const EXECUTED_EVENT = parseAbiItem(
  "event Executed(uint256 indexed proposerId, uint256 indexed reviewerId, bytes32 indexed requestHash, address target, uint256 value, bytes returnData)",
);

export const REJECTED_EVENT = parseAbiItem(
  "event Rejected(uint256 indexed proposerId, uint256 indexed reviewerId, bytes32 indexed requestHash, uint8 reason, string evidenceURI)",
);

/// Returned by orchestrator to render UI state.
export type GateOutcome =
  | { kind: "executed"; txHash: Hex; requestHash: Hex; gateAddress: Address }
  | { kind: "rejected"; txHash: Hex; requestHash: Hex; reason: number; gateAddress: Address };

/// Convenience: extract requestHash from an Executed log.
export function executedHashFromLog(log: Log): Hex | undefined {
  // requestHash is the third indexed topic (topics[3]).
  return log.topics[3] as Hex | undefined;
}
