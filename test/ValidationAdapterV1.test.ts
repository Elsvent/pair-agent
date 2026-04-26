import { expect } from "chai";
import hre from "hardhat";
import { keccak256, toBytes, type Address, type Hex } from "viem";

/**
 * T030 — ValidationAdapterV1 against the canonical ValidationRegistryUpgradeable.
 *
 * Deploys a TestValidationRegistry (canonical body, single-step init via
 * assembly slot-set; see src/test-helpers/TestValidationRegistry.sol for
 * rationale) and verifies that ValidationAdapterV1.postOutcome translates
 * cleanly to the canonical two-phase API:
 *   1) registry.validationRequest(...) — adapter is the validator
 *   2) registry.validationResponse(...) — same caller, completes the record
 */
describe("ValidationAdapterV1 (T030)", function () {
  it("postOutcome calls validationRequest then validationResponse with mapped fields", async function () {
    const id = await hre.viem.deployContract("MockIdentityRegistry");
    const registry = await hre.viem.deployContract("TestValidationRegistry");
    await registry.write.initTestable([id.address]);

    const adapter = await hre.viem.deployContract("ValidationAdapterV1", [registry.address]);

    // Agent owner must be the adapter so the canonical permission check
    // (msg.sender == owner) passes inside validationRequest.
    const AGENT_ID = 1n;
    const someWallet: Address = "0x0000000000000000000000000000000000000111";
    await id.write.setAgent([AGENT_ID, adapter.address, someWallet, "ipfs://agent"]);

    const requestHash: Hex = keccak256(toBytes("req-1"));
    const evidenceHash: Hex = keccak256(toBytes("evidence-1"));
    const tag: Hex = keccak256(toBytes("PairReviewGate.v1"));
    const evidenceURI = "ipfs://evidence";

    const txHash = await adapter.write.postOutcome([
      AGENT_ID,
      100,
      requestHash,
      evidenceURI,
      evidenceHash,
      tag,
    ]);
    const publicClient = await hre.viem.getPublicClient();
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    expect(receipt.status).to.equal("success");

    // ValidationRequest event recorded with adapter as validator + correct fields.
    const reqEvents = await registry.getEvents.ValidationRequest();
    expect(reqEvents.length).to.be.greaterThan(0);
    const reqEv = reqEvents[reqEvents.length - 1];
    if (!reqEv) throw new Error();
    expect(reqEv.args.validatorAddress?.toLowerCase()).to.equal(adapter.address.toLowerCase());
    expect(reqEv.args.agentId).to.equal(AGENT_ID);
    expect(reqEv.args.requestURI).to.equal(evidenceURI);
    expect(reqEv.args.requestHash).to.equal(requestHash);

    // ValidationResponse event recorded with score, evidence, hex-tag.
    const respEvents = await registry.getEvents.ValidationResponse();
    expect(respEvents.length).to.be.greaterThan(0);
    const respEv = respEvents[respEvents.length - 1];
    if (!respEv) throw new Error();
    expect(respEv.args.requestHash).to.equal(requestHash);
    expect(respEv.args.response).to.equal(100);
    expect(respEv.args.responseURI).to.equal(evidenceURI);
    expect(respEv.args.responseHash).to.equal(evidenceHash);
    expect(respEv.args.tag).to.equal(tag); // canonical receives bytes32 hex-string of the tag

    // Persisted state: getValidationStatus returns the recorded outcome.
    const status = await registry.read.getValidationStatus([requestHash]);
    expect(status[2]).to.equal(100); // response
    expect(status[3]).to.equal(evidenceHash);
    expect(status[4]).to.equal(tag);
  });

  it("rejection (score=0) is recorded the same way", async function () {
    const id = await hre.viem.deployContract("MockIdentityRegistry");
    const registry = await hre.viem.deployContract("TestValidationRegistry");
    await registry.write.initTestable([id.address]);
    const adapter = await hre.viem.deployContract("ValidationAdapterV1", [registry.address]);

    await id.write.setAgent([
      1n,
      adapter.address,
      "0x0000000000000000000000000000000000000111" as Address,
      "ipfs://a",
    ]);

    const requestHash: Hex = keccak256(toBytes("rej-req"));
    const evidenceHash: Hex = keccak256(toBytes("rej-ev"));
    const tag: Hex = keccak256(toBytes("PairReviewGate.v1"));

    await adapter.write.postOutcome([
      1n,
      0, // REJECTED
      requestHash,
      "ipfs://rej",
      evidenceHash,
      tag,
    ]);

    const status = await registry.read.getValidationStatus([requestHash]);
    expect(status[2]).to.equal(0);
  });
});
