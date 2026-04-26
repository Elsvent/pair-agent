import { expect } from "chai";
import hre from "hardhat";
import { readFileSync } from "node:fs";
import { getAddress, type Address, type Hex } from "viem";

import { computeDigest, type AgentRequest } from "../app/lib/eip712";

/**
 * T004 — EIP-712 cross-reference test (CLAUDE.md Rule 3).
 *
 * Asserts that:
 *   (a) gate.digestOf(req) (Solidity-side) equals the precomputed fixture digest
 *   (b) computeDigest(...) (TS-side, app/lib/eip712.ts) equals the same fixture digest
 *
 * If any one of those three sides diverges, this test fails loudly. The
 * fixture is the immutable contract; gen-fixtures.ts must be re-run only
 * when the AgentRequest schema or the EIP-712 domain intentionally changes.
 *
 * Address determinism contract: PairReviewGate MUST be the first contract
 * deployed from account #0 in this test. The fixture's verifyingContract is
 * Hardhat's deterministic first-deploy address (0x5FbDB2...). Adding any
 * deploy before the gate breaks the address match.
 */

interface SerializedAgentRequest {
  proposerId: string;
  reviewerId: string;
  target: Address;
  value: string;
  data: Hex;
  nonce: string;
  deadline: string;
  contextHash: Hex;
}

interface FixtureCase {
  request: SerializedAgentRequest;
  expectedDigest: Hex;
}

interface FixtureFile {
  chainId: number;
  verifyingContract: Address;
  cases: FixtureCase[];
}

function deserialize(r: SerializedAgentRequest): AgentRequest {
  return {
    proposerId: BigInt(r.proposerId),
    reviewerId: BigInt(r.reviewerId),
    target: r.target,
    value: BigInt(r.value),
    data: r.data,
    nonce: BigInt(r.nonce),
    deadline: BigInt(r.deadline),
    contextHash: r.contextHash,
  };
}

describe("EIP-712 cross-reference (T004)", function () {
  let fixture: FixtureFile;
  let gateAddress: Address;
  let publicClient: Awaited<ReturnType<typeof hre.viem.getPublicClient>>;

  before(async function () {
    fixture = JSON.parse(readFileSync("test/fixtures/eip712.json", "utf8")) as FixtureFile;
    if (fixture.cases.length === 0) {
      throw new Error("test/fixtures/eip712.json has 0 cases — run `pnpm fixtures:gen`");
    }

    // Deploy PairReviewGate FIRST AND ONLY from account #0 so its address
    // matches fixture.verifyingContract (Hardhat first-deploy determinism).
    const dummyIdentity: Address = "0x0000000000000000000000000000000000000001";
    const dummyValidation: Address = "0x0000000000000000000000000000000000000002";
    const gate = await hre.viem.deployContract("PairReviewGate", [dummyIdentity, dummyValidation]);
    gateAddress = gate.address;
    publicClient = await hre.viem.getPublicClient();
  });

  it("the deployed gate address matches the fixture verifyingContract", async function () {
    expect(getAddress(gateAddress)).to.equal(getAddress(fixture.verifyingContract));
  });

  it("the active chainId matches the fixture chainId", async function () {
    const chainId = await publicClient.getChainId();
    expect(chainId).to.equal(fixture.chainId);
  });

  it("contract-side gate.digestOf(req) matches fixture.expectedDigest for every case", async function () {
    const gate = await hre.viem.getContractAt("PairReviewGate", gateAddress);

    for (const [i, c] of fixture.cases.entries()) {
      const request = deserialize(c.request);
      // Pass the request as a tuple matching the AgentRequest struct order.
      const onChainDigest = await gate.read.digestOf([request]);
      expect(onChainDigest, `case ${i} contract digest`).to.equal(c.expectedDigest);
    }
  });

  it("TS-side computeDigest matches fixture.expectedDigest for every case", async function () {
    for (const [i, c] of fixture.cases.entries()) {
      const request = deserialize(c.request);
      const tsDigest = computeDigest({
        chainId: fixture.chainId,
        verifyingContract: fixture.verifyingContract,
        request,
      });
      expect(tsDigest, `case ${i} TS digest`).to.equal(c.expectedDigest);
    }
  });

  it("contract digest === TS digest for every case (the actual cross-reference)", async function () {
    const gate = await hre.viem.getContractAt("PairReviewGate", gateAddress);

    for (const [i, c] of fixture.cases.entries()) {
      const request = deserialize(c.request);
      const onChainDigest = await gate.read.digestOf([request]);
      const tsDigest = computeDigest({
        chainId: fixture.chainId,
        verifyingContract: fixture.verifyingContract,
        request,
      });
      expect(onChainDigest, `case ${i}`).to.equal(tsDigest);
    }
  });
});
