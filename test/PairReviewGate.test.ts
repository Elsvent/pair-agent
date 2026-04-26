import { expect } from "chai";
import hre from "hardhat";
import {
  encodeFunctionData,
  getAddress,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { signAgentRequest, HARDHAT_PK_0, HARDHAT_PK_1 } from "./helpers/signing";
import type { AgentRequest } from "../app/lib/eip712";

const CHAIN_ID = 84532; // matches hardhat.config.ts networks.hardhat.chainId

const BUMP_ABI = [
  {
    name: "bump",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "x", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

interface DeployedRig {
  id: Awaited<ReturnType<typeof hre.viem.deployContract<"MockIdentityRegistry">>>;
  va: Awaited<ReturnType<typeof hre.viem.deployContract<"MockValidationAdapter">>>;
  target: Awaited<ReturnType<typeof hre.viem.deployContract<"CallTarget">>>;
  gate: Awaited<ReturnType<typeof hre.viem.deployContract<"PairReviewGate">>>;
  proposer: ReturnType<typeof privateKeyToAccount>;
  reviewer: ReturnType<typeof privateKeyToAccount>;
}

async function deployRig(): Promise<DeployedRig> {
  const proposer = privateKeyToAccount(HARDHAT_PK_0);
  const reviewer = privateKeyToAccount(HARDHAT_PK_1);

  const id = await hre.viem.deployContract("MockIdentityRegistry");
  const va = await hre.viem.deployContract("MockValidationAdapter");
  const target = await hre.viem.deployContract("CallTarget");

  const [ownerClient] = await hre.viem.getWalletClients();
  if (!ownerClient) throw new Error("expected at least 1 wallet client");

  await id.write.setAgent([1n, ownerClient.account.address, proposer.address, "ipfs://p"]);
  await id.write.setAgent([2n, ownerClient.account.address, reviewer.address, "ipfs://r"]);

  const gate = await hre.viem.deployContract("PairReviewGate", [id.address, va.address]);

  return { id, va, target, gate, proposer, reviewer };
}

function bumpRequest(
  target: Address,
  overrides: Partial<AgentRequest> = {},
): AgentRequest {
  return {
    proposerId: 1n,
    reviewerId: 2n,
    target,
    value: 0n,
    data: encodeFunctionData({ abi: BUMP_ABI, functionName: "bump", args: [42n] }),
    nonce: 0n,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
    contextHash: keccak256(toBytes("ctx")),
    ...overrides,
  };
}

describe("PairReviewGate (T011)", function () {
  describe("execute() happy path", function () {
    it("forwards the call, posts APPROVED to validation, emits Executed", async function () {
      const { gate, target, va, proposer, reviewer } = await deployRig();
      const req = bumpRequest(target.address);
      const signArgs = { chainId: CHAIN_ID, verifyingContract: gate.address, request: req };
      const proposerSig = await signAgentRequest(proposer, signArgs);
      const reviewerSig = await signAgentRequest(reviewer, signArgs);

      const evidenceURI = "ipfs://evidence";
      const evidenceHash: Hex = keccak256(toBytes("evidence"));

      const txHash = await gate.write.execute([req, proposerSig, reviewerSig, evidenceURI, evidenceHash]);
      const publicClient = await hre.viem.getPublicClient();
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      expect(receipt.status).to.equal("success");

      // Target was called once.
      expect(await target.read.callCount()).to.equal(1n);
      expect(await target.read.lastValue()).to.equal(0n);

      // Validation registry recorded an APPROVED outcome.
      expect(await va.read.callCount()).to.equal(1n);
      const last = await va.read.lastCall();
      expect(last.score).to.equal(100);
      expect(last.subjectAgentId).to.equal(1n);
      expect(last.evidenceURI).to.equal(evidenceURI);
      expect(last.evidenceHash).to.equal(evidenceHash);

      // Pair nonce advanced.
      expect(await gate.read.nonceOf([1n, 2n])).to.equal(1n);

      // Executed event emitted with the right args.
      const events = await gate.getEvents.Executed();
      expect(events.length).to.be.greaterThan(0);
      const ev = events[events.length - 1];
      if (!ev) throw new Error("expected at least one Executed event");
      expect(ev.args.proposerId).to.equal(1n);
      expect(ev.args.reviewerId).to.equal(2n);
      expect(getAddress(ev.args.target!)).to.equal(getAddress(target.address));
      expect(ev.args.value).to.equal(0n);
    });

    it("forwards msg.value to the target when req.value > 0", async function () {
      const { gate, target, proposer, reviewer } = await deployRig();
      const VALUE = 12_345n;

      const req = bumpRequest(target.address, { value: VALUE });
      const signArgs = { chainId: CHAIN_ID, verifyingContract: gate.address, request: req };
      const proposerSig = await signAgentRequest(proposer, signArgs);
      const reviewerSig = await signAgentRequest(reviewer, signArgs);

      await gate.write.execute(
        [req, proposerSig, reviewerSig, "ipfs://e", keccak256(toBytes("e"))],
        { value: VALUE },
      );

      expect(await target.read.lastValue()).to.equal(VALUE);
    });
  });
});
