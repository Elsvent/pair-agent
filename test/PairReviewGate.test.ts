import { expect } from "chai";
import hre from "hardhat";
import {
  encodeFunctionData,
  getAddress,
  keccak256,
  parseAbi,
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

  describe("execute() replay + domain protection (T012)", function () {
    it("reverts on replay (same nonce)", async function () {
      const { gate, target, proposer, reviewer } = await deployRig();
      const req = bumpRequest(target.address);
      const signArgs = { chainId: CHAIN_ID, verifyingContract: gate.address, request: req };
      const proposerSig = await signAgentRequest(proposer, signArgs);
      const reviewerSig = await signAgentRequest(reviewer, signArgs);
      const evidenceURI = "ipfs://e";
      const evidenceHash: Hex = keccak256(toBytes("e"));

      // First execute succeeds.
      await gate.write.execute([req, proposerSig, reviewerSig, evidenceURI, evidenceHash]);

      // Replay with the same req (which now carries a stale nonce 0) reverts BadNonce.
      await expect(
        gate.write.execute([req, proposerSig, reviewerSig, evidenceURI, evidenceHash]),
      ).to.be.rejectedWith(/BadNonce/);
    });

    it("reverts on expired deadline (ExpiredDeadline)", async function () {
      const { gate, target, proposer, reviewer } = await deployRig();
      // Set deadline in the past.
      const req = bumpRequest(target.address, { deadline: 1n });
      const signArgs = { chainId: CHAIN_ID, verifyingContract: gate.address, request: req };
      const proposerSig = await signAgentRequest(proposer, signArgs);
      const reviewerSig = await signAgentRequest(reviewer, signArgs);

      await expect(
        gate.write.execute([req, proposerSig, reviewerSig, "", "0x" + "00".repeat(32) as Hex]),
      ).to.be.rejectedWith(/ExpiredDeadline/);
    });

    it("reverts when the signature was made against a different chainId (InvalidProposerSig)", async function () {
      const { gate, target, proposer, reviewer } = await deployRig();
      const req = bumpRequest(target.address);

      // Proposer signs against chainId 1 (mainnet), reviewer signs correctly.
      const proposerSigWrongChain = await signAgentRequest(proposer, {
        chainId: 1,
        verifyingContract: gate.address,
        request: req,
      });
      const reviewerSig = await signAgentRequest(reviewer, {
        chainId: CHAIN_ID,
        verifyingContract: gate.address,
        request: req,
      });

      await expect(
        gate.write.execute([req, proposerSigWrongChain, reviewerSig, "", "0x" + "00".repeat(32) as Hex]),
      ).to.be.rejectedWith(/InvalidProposerSig/);
    });

    it("reverts when the signature was made against a different verifyingContract (InvalidReviewerSig)", async function () {
      const { gate, target, proposer, reviewer } = await deployRig();
      const req = bumpRequest(target.address);

      const proposerSig = await signAgentRequest(proposer, {
        chainId: CHAIN_ID,
        verifyingContract: gate.address,
        request: req,
      });
      // Reviewer signs against a fake gate address.
      const reviewerSigWrongVerifying = await signAgentRequest(reviewer, {
        chainId: CHAIN_ID,
        verifyingContract: "0x000000000000000000000000000000000000dead" as Address,
        request: req,
      });

      await expect(
        gate.write.execute([req, proposerSig, reviewerSigWrongVerifying, "", "0x" + "00".repeat(32) as Hex]),
      ).to.be.rejectedWith(/InvalidReviewerSig/);
    });
  });

  describe("execute() ERC-1271 reviewer path (T015)", function () {
    it("executes when the reviewer is a MockERC1271 smart-account wallet", async function () {
      const { id, va, target, gate, proposer, reviewer } = await deployRig();

      // Deploy a 1271 wallet pointing at the reviewer's underlying key.
      const wallet = await hre.viem.deployContract("MockERC1271", [reviewer.address]);
      // Rotate the reviewer's wallet in the registry to the 1271 contract.
      await id.write.rotateAgentWallet([2n, wallet.address]);

      const req = bumpRequest(target.address);
      const signArgs = { chainId: CHAIN_ID, verifyingContract: gate.address, request: req };
      const proposerSig = await signAgentRequest(proposer, signArgs);
      // Reviewer still signs with the same key — 1271 wallet recovers it.
      const reviewerSig = await signAgentRequest(reviewer, signArgs);

      await gate.write.execute([req, proposerSig, reviewerSig, "ipfs://e", keccak256(toBytes("e"))]);
      expect(await target.read.callCount()).to.equal(1n);
      expect(await va.read.callCount()).to.equal(1n);
    });

    it("reverts when the 1271 wallet is toggled invalid -> InvalidReviewerSig", async function () {
      const { id, target, gate, proposer, reviewer } = await deployRig();

      const wallet = await hre.viem.deployContract("MockERC1271", [reviewer.address]);
      await id.write.rotateAgentWallet([2n, wallet.address]);
      await wallet.write.toggleInvalid([true]);

      const req = bumpRequest(target.address);
      const signArgs = { chainId: CHAIN_ID, verifyingContract: gate.address, request: req };
      const proposerSig = await signAgentRequest(proposer, signArgs);
      const reviewerSig = await signAgentRequest(reviewer, signArgs);

      await expect(
        gate.write.execute([req, proposerSig, reviewerSig, "", "0x" + "00".repeat(32) as Hex]),
      ).to.be.rejectedWith(/InvalidReviewerSig/);
    });
  });

  describe("postRejection() (T018)", function () {
    it("posts REJECTED, advances nonce, emits Rejected", async function () {
      const { gate, va, target, proposer } = await deployRig();
      const req = bumpRequest(target.address);
      const signArgs = { chainId: CHAIN_ID, verifyingContract: gate.address, request: req };
      const proposerSig = await signAgentRequest(proposer, signArgs);

      // RejectionReason.ReviewerPolicy == 1 in the enum order
      // (Unspecified=0, ReviewerPolicy=1, ReviewerSignatureMissing=2, ...)
      const REASON_REVIEWER_POLICY = 1;

      await gate.write.postRejection([
        req,
        proposerSig,
        REASON_REVIEWER_POLICY,
        "ipfs://rej",
        keccak256(toBytes("rej")),
      ]);

      // Validation registry recorded a REJECTED outcome with score=0.
      expect(await va.read.callCount()).to.equal(1n);
      const last = await va.read.lastCall();
      expect(last.score).to.equal(0);
      expect(last.subjectAgentId).to.equal(1n);

      // Nonce advanced.
      expect(await gate.read.nonceOf([1n, 2n])).to.equal(1n);

      // Rejected event.
      const events = await gate.getEvents.Rejected();
      expect(events.length).to.be.greaterThan(0);
      const ev = events[events.length - 1];
      if (!ev) throw new Error("expected Rejected event");
      expect(ev.args.proposerId).to.equal(1n);
      expect(ev.args.reviewerId).to.equal(2n);
      expect(ev.args.reason).to.equal(REASON_REVIEWER_POLICY);
    });

    it("blocks subsequent execute() as approved (nonce advanced -> BadNonce)", async function () {
      const { gate, target, proposer, reviewer } = await deployRig();
      const req = bumpRequest(target.address);
      const signArgs = { chainId: CHAIN_ID, verifyingContract: gate.address, request: req };
      const proposerSig = await signAgentRequest(proposer, signArgs);
      const reviewerSig = await signAgentRequest(reviewer, signArgs);

      // Reject first.
      await gate.write.postRejection([
        req,
        proposerSig,
        1, // ReviewerPolicy
        "ipfs://rej",
        keccak256(toBytes("rej")),
      ]);

      // Now try to execute the same request — must fail BadNonce because
      // postRejection advanced the pair nonce.
      await expect(
        gate.write.execute([req, proposerSig, reviewerSig, "", "0x" + "00".repeat(32) as Hex]),
      ).to.be.rejectedWith(/BadNonce/);
    });

    it("rejects with empty proposerSig (validator can record a proposer-side abort)", async function () {
      const { gate, va, target } = await deployRig();
      const req = bumpRequest(target.address);

      // Empty proposerSig means "no proof, but a validator wants the rejection on record".
      await gate.write.postRejection([
        req,
        "0x" as Hex,
        2, // ReviewerSignatureMissing
        "ipfs://rej-empty",
        keccak256(toBytes("rej-empty")),
      ]);

      expect(await va.read.callCount()).to.equal(1n);
      expect((await va.read.lastCall()).score).to.equal(0);
    });
  });

  describe("execute() id-shape guards (T017)", function () {
    it("reverts when proposerId == reviewerId -> SameAgentTwice", async function () {
      const { gate, target, proposer, reviewer } = await deployRig();
      const req = bumpRequest(target.address, { reviewerId: 1n }); // same as proposerId
      const signArgs = { chainId: CHAIN_ID, verifyingContract: gate.address, request: req };
      const proposerSig = await signAgentRequest(proposer, signArgs);
      const reviewerSig = await signAgentRequest(reviewer, signArgs);

      await expect(
        gate.write.execute([req, proposerSig, reviewerSig, "", "0x" + "00".repeat(32) as Hex]),
      ).to.be.rejectedWith(/SameAgentTwice/);
    });

    it("reverts when proposerId == 0 -> ZeroAgentId", async function () {
      const { gate, target, proposer, reviewer } = await deployRig();
      const req = bumpRequest(target.address, { proposerId: 0n });
      const signArgs = { chainId: CHAIN_ID, verifyingContract: gate.address, request: req };
      const proposerSig = await signAgentRequest(proposer, signArgs);
      const reviewerSig = await signAgentRequest(reviewer, signArgs);

      await expect(
        gate.write.execute([req, proposerSig, reviewerSig, "", "0x" + "00".repeat(32) as Hex]),
      ).to.be.rejectedWith(/ZeroAgentId/);
    });

    it("reverts when reviewerId == 0 -> ZeroAgentId", async function () {
      const { gate, target, proposer, reviewer } = await deployRig();
      const req = bumpRequest(target.address, { reviewerId: 0n });
      const signArgs = { chainId: CHAIN_ID, verifyingContract: gate.address, request: req };
      const proposerSig = await signAgentRequest(proposer, signArgs);
      const reviewerSig = await signAgentRequest(reviewer, signArgs);

      await expect(
        gate.write.execute([req, proposerSig, reviewerSig, "", "0x" + "00".repeat(32) as Hex]),
      ).to.be.rejectedWith(/ZeroAgentId/);
    });
  });

  describe("execute() reentrancy guard (T016)", function () {
    it("reverts when the target re-enters execute() (nonReentrant)", async function () {
      const { gate, proposer, reviewer } = await deployRig();
      const attacker = await hre.viem.deployContract("ReentrancyAttacker");

      // Build a request that calls into the attacker.
      const req = bumpRequest(attacker.address, {
        // Any non-empty calldata that doesn't match a function on the attacker
        // routes to fallback(). 0xdeadbeef is a fine sentinel.
        data: "0xdeadbeef" as Hex,
      });
      const signArgs = { chainId: CHAIN_ID, verifyingContract: gate.address, request: req };
      const proposerSig = await signAgentRequest(proposer, signArgs);
      const reviewerSig = await signAgentRequest(reviewer, signArgs);

      // Pre-arm the attacker with the FULL execute() calldata so its fallback
      // re-enters with the same args.
      const evidenceURI = "ipfs://e";
      const evidenceHash: Hex = keccak256(toBytes("e"));
      const executeCalldata = encodeFunctionData({
        abi: parseAbi([
          "function execute((uint256,uint256,address,uint256,bytes,uint256,uint256,bytes32) req, bytes proposerSig, bytes reviewerSig, string evidenceURI, bytes32 evidenceHash) external payable returns (bytes)",
        ]),
        functionName: "execute",
        args: [
          [
            req.proposerId,
            req.reviewerId,
            req.target,
            req.value,
            req.data,
            req.nonce,
            req.deadline,
            req.contextHash,
          ],
          proposerSig,
          reviewerSig,
          evidenceURI,
          evidenceHash,
        ],
      });
      await attacker.write.arm([gate.address, executeCalldata]);

      // Outer execute call: attacker.fallback() runs, attempts the recursive
      // execute, hits ReentrancyGuard, bubbles up. Outer execute sees the
      // call failed -> CallFailed.
      await expect(
        gate.write.execute([req, proposerSig, reviewerSig, evidenceURI, evidenceHash]),
      ).to.be.rejectedWith(/CallFailed|ReentrancyGuard/);
    });
  });

  describe("execute() contextHash binding (T013)", function () {
    it("reverts on contextHash mismatch (InvalidReviewerSig)", async function () {
      const { gate, target, proposer, reviewer } = await deployRig();
      const reqA = bumpRequest(target.address, { contextHash: keccak256(toBytes("ctx-A")) });
      const reqB = { ...reqA, contextHash: keccak256(toBytes("ctx-B")) };

      // Proposer signs over reqA, reviewer signs over reqB. Submit reqA.
      const proposerSig = await signAgentRequest(proposer, {
        chainId: CHAIN_ID,
        verifyingContract: gate.address,
        request: reqA,
      });
      const reviewerSigOverB = await signAgentRequest(reviewer, {
        chainId: CHAIN_ID,
        verifyingContract: gate.address,
        request: reqB,
      });

      // contextHash is in the EIP-712 struct hash, so reviewerSigOverB recovers
      // a different address than reviewerWallet when verified against reqA's digest.
      await expect(
        gate.write.execute([reqA, proposerSig, reviewerSigOverB, "", "0x" + "00".repeat(32) as Hex]),
      ).to.be.rejectedWith(/InvalidReviewerSig/);
    });
  });
});
