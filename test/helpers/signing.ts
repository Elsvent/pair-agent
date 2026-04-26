// test/helpers/signing.ts
//
// Canonical EIP-712 signing helper for PairReviewGate tests.
// Every test MUST template off this helper — do not inline signTypedData
// calls. The point is to keep one definition of how an AgentRequest is
// signed, so contract↔frontend digest equivalence (CLAUDE.md Rule 3) has
// exactly one TS-side path to audit.

import { type Address, type Hex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { AGENT_REQUEST_TYPES, buildDomain, type AgentRequest } from "../../app/lib/eip712";

/// Build a viem account from a 0x-prefixed private key.
export function makeAccount(privateKey: Hex): PrivateKeyAccount {
  return privateKeyToAccount(privateKey);
}

/// Sign an AgentRequest as `account` against the EIP-712 domain
/// (PairReviewGate v1, chainId, verifyingContract).
export async function signAgentRequest(
  account: PrivateKeyAccount,
  args: { chainId: number; verifyingContract: Address; request: AgentRequest },
): Promise<Hex> {
  return account.signTypedData({
    domain: buildDomain(args.chainId, args.verifyingContract),
    types: AGENT_REQUEST_TYPES,
    primaryType: "AgentRequest",
    message: args.request,
  });
}

/// Convenience: well-known Hardhat default account #0 private key.
/// Deterministic; safe to hardcode for tests only.
export const HARDHAT_PK_0: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
export const HARDHAT_PK_1: Hex = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
export const HARDHAT_PK_2: Hex = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
