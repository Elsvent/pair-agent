// app/scripts/gen-fixtures.ts
//
// Generates test/fixtures/eip712.json — the source of truth for the
// EIP-712 cross-reference test (test/EIP712Reference.test.ts).
//
// Run via: pnpm fixtures:gen
//
// Output shape:
// {
//   chainId: number,
//   verifyingContract: address,
//   cases: [{ request: AgentRequest (stringified bigints), expectedDigest: Hex }, ...]
// }
//
// IMPORTANT — Address determinism contract:
//   `verifyingContract` here is Hardhat's first-deployment address from
//   account #0 with nonce 0: 0x5FbDB2315678afecb367f032d93F642f64180aa3.
//   The cross-reference test MUST deploy PairReviewGate as the first and
//   only contract from account #0. Any extra deploy before the gate breaks
//   address determinism and the digest assertions will fail.
//
//   `chainId` matches networks.hardhat.chainId in hardhat.config.ts.

import { writeFileSync, mkdirSync } from "node:fs";
import { encodeFunctionData, type Address, type Hex } from "viem";
import { computeDigest, type AgentRequest } from "../lib/eip712";

// Match networks.hardhat.chainId in hardhat.config.ts (Base Sepolia).
const CHAIN_ID = 84532;

// Hardhat's deterministic first-deploy address from account #0 nonce 0.
const VERIFYING_CONTRACT: Address = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

const CASES: AgentRequest[] = [
  // Case 0 — minimal: empty calldata, zero value, fresh nonce.
  {
    proposerId: 1n,
    reviewerId: 2n,
    target: "0x0000000000000000000000000000000000000aaa",
    value: 0n,
    data: "0x",
    nonce: 0n,
    deadline: 1_800_000_000n,
    contextHash: ("0x" + "11".repeat(32)) as Hex,
  },
  // Case 1 — typed call with value transfer.
  {
    proposerId: 1n,
    reviewerId: 2n,
    target: "0x0000000000000000000000000000000000000aaa",
    value: 1_000_000_000n,
    data: encodeFunctionData({
      abi: [
        {
          name: "bump",
          type: "function",
          inputs: [{ name: "x", type: "uint256" }],
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "payable",
        },
      ],
      functionName: "bump",
      args: [42n],
    }),
    nonce: 5n,
    deadline: 1_800_001_234n,
    contextHash: ("0x" + "22".repeat(32)) as Hex,
  },
  // Case 2 — long calldata to exercise keccak256(bytes) on the dynamic field.
  {
    proposerId: 999n,
    reviewerId: 1000n,
    target: "0x000000000000000000000000000000000000beef",
    value: 0n,
    data: ("0xabcdef" + "deadbeef".repeat(64)) as Hex,
    nonce: 1n,
    deadline: 1_999_999_999n,
    contextHash: ("0x" + "33".repeat(32)) as Hex,
  },
  // Case 3 — high agent ids, max-ish value, distinct context.
  {
    proposerId: 9_999_999n,
    reviewerId: 10_000_000n,
    target: "0xcafecafecafecafecafecafecafecafecafecafe",
    value: 2n ** 64n,
    data: "0xdeadbeef",
    nonce: 100n,
    deadline: 2_000_000_000n,
    contextHash: ("0x" + "ab".repeat(32)) as Hex,
  },
  // Case 4 — zero contextHash + late deadline.
  {
    proposerId: 7n,
    reviewerId: 8n,
    target: "0x0000000000000000000000000000000000001234",
    value: 0n,
    data: "0x",
    nonce: 42n,
    deadline: 9_999_999_999n,
    contextHash: ("0x" + "00".repeat(32)) as Hex,
  },
];

function main() {
  const cases = CASES.map((request) => ({
    request: serialize(request),
    expectedDigest: computeDigest({ chainId: CHAIN_ID, verifyingContract: VERIFYING_CONTRACT, request }),
  }));

  const out = {
    chainId: CHAIN_ID,
    verifyingContract: VERIFYING_CONTRACT,
    cases,
  };

  mkdirSync("test/fixtures", { recursive: true });
  writeFileSync("test/fixtures/eip712.json", JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote test/fixtures/eip712.json with ${cases.length} cases`);
}

// JSON cannot represent bigint natively. Stringify them.
function serialize(r: AgentRequest) {
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

main();
