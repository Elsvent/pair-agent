// app/lib/eip712.ts
//
// Frontend EIP-712 helper. Must produce digests byte-identical to the contract.
// Cross-reference test: test/EIP712Reference.t.sol.
//
// Rule of thumb: if you change anything here, run `pnpm fixtures:gen` and make
// sure `forge test --match-contract EIP712Reference` is still green.

import { hashTypedData, type Address, type Hex } from "viem";

/** Match PairReviewGate constructor's EIP712(name, version). */
export const DOMAIN_NAME = "PairReviewGate";
export const DOMAIN_VERSION = "1";

/** AgentRequest struct — must mirror src/interfaces/IPairReviewGate.sol exactly. */
export type AgentRequest = {
  proposerId: bigint;
  reviewerId: bigint;
  target: Address;
  value: bigint;
  data: Hex;
  nonce: bigint;
  deadline: bigint;
  contextHash: Hex;
};

/**
 * EIP-712 typed-data schema. The order of fields matters; viem's hashTypedData
 * follows it exactly when computing the struct hash.
 */
export const AGENT_REQUEST_TYPES = {
  AgentRequest: [
    { name: "proposerId", type: "uint256" },
    { name: "reviewerId", type: "uint256" },
    { name: "target", type: "address" },
    { name: "value", type: "uint256" },
    { name: "data", type: "bytes" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "contextHash", type: "bytes32" },
  ],
} as const;

export function buildDomain(chainId: number, verifyingContract: Address) {
  return {
    name: DOMAIN_NAME,
    version: DOMAIN_VERSION,
    chainId,
    verifyingContract,
  } as const;
}

export function computeDigest(args: {
  chainId: number;
  verifyingContract: Address;
  request: AgentRequest;
}): Hex {
  return hashTypedData({
    domain: buildDomain(args.chainId, args.verifyingContract),
    types: AGENT_REQUEST_TYPES,
    primaryType: "AgentRequest",
    message: args.request,
  });
}
