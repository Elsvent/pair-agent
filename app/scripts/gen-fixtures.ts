// app/scripts/gen-fixtures.ts
//
// Generates test/fixtures/eip712.json — the source of truth for the
// EIP-712 cross-reference test. Run via `pnpm fixtures:gen`.
//
// Output shape:
// {
//   chainId: number,
//   verifyingContract: address,
//   cases: [{ request: AgentRequest, expectedDigest: Hex }, ...]
// }
//
// IMPORTANT: chainId and verifyingContract here MUST match the values used
// in test/EIP712Reference.t.sol::setUp(). If you change one, change both.

import { writeFileSync, mkdirSync } from "node:fs";
import { encodeFunctionData, type Address, type Hex } from "viem";
import { computeDigest, type AgentRequest } from "../lib/eip712";

// Lock chainId so fixtures are reproducible. Match EIP712Reference.t.sol.
const CHAIN_ID = 11155111;

// Foundry's deterministic first-deploy address with the test setup
// (3 contracts deployed before gate: id, va, gate -> 3rd contract).
// If setUp() ordering changes, regenerate.
const VERIFYING_CONTRACT: Address = "0x2e234DAe75C793f67A35089C9d99245E1C58470b";

const CASES: AgentRequest[] = [
  {
    proposerId: 1n,
    reviewerId: 2n,
    target: "0x0000000000000000000000000000000000000aaa",
    value: 0n,
    data: "0x",
    nonce: 0n,
    deadline: 1_800_000_000n,
    contextHash: "0x" + "11".repeat(32) as Hex,
  },
  {
    proposerId: 1n,
    reviewerId: 2n,
    target: "0x0000000000000000000000000000000000000aaa",
    value: 1_000_000_000n,
    data: encodeFunctionData({
      abi: [{ name: "bump", type: "function", inputs: [{ name: "x", type: "uint256" }], outputs: [] }],
      functionName: "bump",
      args: [42n],
    }),
    nonce: 5n,
    deadline: 1_800_001_234n,
    contextHash: "0x" + "22".repeat(32) as Hex,
  },
  {
    proposerId: 999n,
    reviewerId: 1000n,
    target: "0x000000000000000000000000000000000000bEEF",
    value: 0n,
    // Long calldata to exercise the keccak256(bytes) dynamic-type path
    data: ("0xabcdef" + "deadbeef".repeat(64)) as Hex,
    nonce: 1n,
    deadline: 1_999_999_999n,
    contextHash: "0x" + "33".repeat(32) as Hex,
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
