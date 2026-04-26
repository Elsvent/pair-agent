import { expect } from "chai";
import hre from "hardhat";
import { encodeFunctionData, keccak256, toBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { signAgentRequest, HARDHAT_PK_0, HARDHAT_PK_1, HARDHAT_PK_2 } from "./helpers/signing";
import type { AgentRequest } from "../app/lib/eip712";

/**
 * T014 — Operator rotation invalidates in-flight signatures.
 *
 * This test enforces CLAUDE.md Rule 5: PairReviewGate MUST resolve agent
 * wallets via identity.getAgentWallet(...) at execution time, never caching
 * or pre-resolving. If a maintainer "optimizes" by caching, this test fails.
 */

const CHAIN_ID = 84532;

const PING_ABI = [
  {
    name: "ping",
    type: "function",
    stateMutability: "payable",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

describe("OperatorRotation (T014)", function () {
  it("rotation invalidates in-flight Proposer signature -> InvalidProposerSig", async function () {
    const proposerK1 = privateKeyToAccount(HARDHAT_PK_0);
    const reviewer = privateKeyToAccount(HARDHAT_PK_1);
    const proposerK2 = privateKeyToAccount(HARDHAT_PK_2);

    const id = await hre.viem.deployContract("MockIdentityRegistry");
    const va = await hre.viem.deployContract("MockValidationAdapter");
    const target = await hre.viem.deployContract("CallTarget");

    const [ownerClient] = await hre.viem.getWalletClients();
    if (!ownerClient) throw new Error();

    await id.write.setAgent([1n, ownerClient.account.address, proposerK1.address, "ipfs://p"]);
    await id.write.setAgent([2n, ownerClient.account.address, reviewer.address, "ipfs://r"]);

    const gate = await hre.viem.deployContract("PairReviewGate", [id.address, va.address]);

    // Build a valid request and sign it with K1.
    const req: AgentRequest = {
      proposerId: 1n,
      reviewerId: 2n,
      target: target.address,
      value: 0n,
      data: encodeFunctionData({ abi: PING_ABI, functionName: "ping" }),
      nonce: 0n,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
      contextHash: keccak256(toBytes("ctx")),
    };

    const proposerSig = await signAgentRequest(proposerK1, {
      chainId: CHAIN_ID,
      verifyingContract: gate.address,
      request: req,
    });
    const reviewerSig = await signAgentRequest(reviewer, {
      chainId: CHAIN_ID,
      verifyingContract: gate.address,
      request: req,
    });

    // Rotate the proposer wallet to K2 BEFORE submitting.
    await id.write.rotateAgentWallet([1n, proposerK2.address]);

    // The sig was made with K1 but the registry now reports K2 as the wallet.
    // SignatureChecker should reject -> InvalidProposerSig.
    await expect(
      gate.write.execute([req, proposerSig, reviewerSig, "", "0x" + "00".repeat(32) as Hex]),
    ).to.be.rejectedWith(/InvalidProposerSig/);
  });

  it("after rotation, a fresh signature from the new wallet executes successfully", async function () {
    const proposerK1 = privateKeyToAccount(HARDHAT_PK_0);
    const reviewer = privateKeyToAccount(HARDHAT_PK_1);
    const proposerK2 = privateKeyToAccount(HARDHAT_PK_2);

    const id = await hre.viem.deployContract("MockIdentityRegistry");
    const va = await hre.viem.deployContract("MockValidationAdapter");
    const target = await hre.viem.deployContract("CallTarget");

    const [ownerClient] = await hre.viem.getWalletClients();
    if (!ownerClient) throw new Error();

    await id.write.setAgent([1n, ownerClient.account.address, proposerK1.address, "ipfs://p"]);
    await id.write.setAgent([2n, ownerClient.account.address, reviewer.address, "ipfs://r"]);

    const gate = await hre.viem.deployContract("PairReviewGate", [id.address, va.address]);

    // Rotate FIRST, then sign with K2.
    await id.write.rotateAgentWallet([1n, proposerK2.address]);

    const req: AgentRequest = {
      proposerId: 1n,
      reviewerId: 2n,
      target: target.address,
      value: 0n,
      data: encodeFunctionData({ abi: PING_ABI, functionName: "ping" }),
      nonce: 0n,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
      contextHash: keccak256(toBytes("ctx")),
    };

    const proposerSig = await signAgentRequest(proposerK2, {
      chainId: CHAIN_ID,
      verifyingContract: gate.address,
      request: req,
    });
    const reviewerSig = await signAgentRequest(reviewer, {
      chainId: CHAIN_ID,
      verifyingContract: gate.address,
      request: req,
    });

    await gate.write.execute([req, proposerSig, reviewerSig, "ipfs://e", keccak256(toBytes("e"))]);
    expect(await va.read.callCount()).to.equal(1n);
  });
});
