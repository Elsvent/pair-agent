import { describe, it, expect } from "vitest";
import { type Address, type Hex } from "viem";

import { runPairReview } from "../orchestrator";
import { StubIPFSPinner } from "../ipfs";
import type { LLMProvider } from "../../agents/proposer";
import type { ReviewerPolicy, ToolDescriptor } from "../types";

const HARDHAT_PK_0: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const HARDHAT_PK_1: Hex = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const SWAP_TARGET: Address = "0x0000000000000000000000000000000000005ada";
const SWAP_SELECTOR: Hex = "0x12345678";
const SAMPLE_DATA: Hex = `${SWAP_SELECTOR}${"00".repeat(32)}` as Hex;

const TOOL_CATALOG: ToolDescriptor[] = [
  { name: "swapExact", description: "swap tokens", selector: SWAP_SELECTOR, target: SWAP_TARGET },
];

const POLICY: ReviewerPolicy = {
  allowedTargets: [SWAP_TARGET],
  maxValueWei: 100_000_000_000_000_000n,
  allowedSelectors: [SWAP_SELECTOR],
  maxRequestsPerMinute: 10,
};

class MockLLM implements LLMProvider {
  constructor(public provider: string, public model: string, private response: string) {}
  async complete(_p: string): Promise<string> {
    return this.response;
  }
}

const PROPOSER_RESPONSE = JSON.stringify({
  selectedTool: "swapExact",
  target: SWAP_TARGET,
  value: "0",
  data: SAMPLE_DATA,
  rationale: "User wants to swap; selecting swapExact.",
});
const REVIEWER_APPROVE = JSON.stringify({ approve: true, rationale: "policy + LLM ok" });
const REVIEWER_REJECT = JSON.stringify({ approve: false, rationale: "looks suspicious" });

describe("orchestrator (T042 core)", () => {
  it("happy path: returns an executable bundle with both signatures + IPFS evidence", async () => {
    const ipfs = new StubIPFSPinner();
    const out = await runPairReview({
      intent: "swap 100 USDC for ETH",
      toolCatalog: TOOL_CATALOG,
      pairNonce: 0n,
      proposerId: 1n,
      reviewerId: 2n,
      proposerKey: HARDHAT_PK_0,
      reviewerKey: HARDHAT_PK_1,
      proposerLLM: new MockLLM("anthropic", "claude-x", PROPOSER_RESPONSE),
      reviewerLLM: new MockLLM("openai", "gpt-x", REVIEWER_APPROVE),
      policy: POLICY,
      gateAddress: "0x5fbdb2315678afecb367f032d93f642f64180aa3",
      chainId: 84532,
      ipfs,
    });

    expect(out.kind).toBe("executable");
    if (out.kind !== "executable") throw new Error();
    expect(out.proposerSig).toMatch(/^0x[0-9a-f]+$/i);
    expect(out.reviewerSig).toMatch(/^0x[0-9a-f]+$/i);
    expect(out.evidenceURI).toMatch(/^ipfs:\/\//);
    expect(out.evidenceHash).toMatch(/^0x[0-9a-f]{64}$/i);

    // Bundle pinned in stub.
    expect(ipfs.bundles.size).toBe(1);
    expect(out.bundle.proposer.provider).toBe("anthropic");
    expect(out.bundle.reviewer.provider).toBe("openai");
    expect(out.bundle.reviewer.decision).toBe("approve");
  });

  it("reviewer-rejection path: returns rejected bundle with proposer sig + reasonCode", async () => {
    const ipfs = new StubIPFSPinner();
    const out = await runPairReview({
      intent: "swap 100 USDC for ETH",
      toolCatalog: TOOL_CATALOG,
      pairNonce: 0n,
      proposerId: 1n,
      reviewerId: 2n,
      proposerKey: HARDHAT_PK_0,
      reviewerKey: HARDHAT_PK_1,
      proposerLLM: new MockLLM("anthropic", "claude-x", PROPOSER_RESPONSE),
      reviewerLLM: new MockLLM("openai", "gpt-x", REVIEWER_REJECT),
      policy: POLICY,
      gateAddress: "0x5fbdb2315678afecb367f032d93f642f64180aa3",
      chainId: 84532,
      ipfs,
    });

    expect(out.kind).toBe("rejected");
    if (out.kind !== "rejected") throw new Error();
    expect(out.proposerSig).toMatch(/^0x[0-9a-f]+$/i);
    expect(out.reason).toMatch(/suspicious/);
    expect(out.bundle.reviewer.decision).toBe("reject");
    expect(out.bundle.reviewer.reasonCode).toBeDefined();
  });

  it("policy-rejection path: rejected by reviewer's policy gate without ever asking the LLM", async () => {
    // Use a value over the cap.
    const ipfs = new StubIPFSPinner();
    const overCap = POLICY.maxValueWei + 1n;
    const proposerOverCap = JSON.stringify({
      selectedTool: "swapExact",
      target: SWAP_TARGET,
      value: overCap.toString(),
      data: SAMPLE_DATA,
      rationale: "swap with high value",
    });

    let llmCalled = false;
    const reviewerLLM = {
      provider: "openai",
      model: "gpt-x",
      complete: async (_p: string) => {
        llmCalled = true;
        return REVIEWER_APPROVE;
      },
    };

    const out = await runPairReview({
      intent: "swap a lot",
      toolCatalog: TOOL_CATALOG,
      pairNonce: 0n,
      proposerId: 1n,
      reviewerId: 2n,
      proposerKey: HARDHAT_PK_0,
      reviewerKey: HARDHAT_PK_1,
      proposerLLM: new MockLLM("anthropic", "claude-x", proposerOverCap),
      reviewerLLM,
      policy: POLICY,
      gateAddress: "0x5fbdb2315678afecb367f032d93f642f64180aa3",
      chainId: 84532,
      ipfs,
    });

    expect(out.kind).toBe("rejected");
    if (out.kind !== "rejected") throw new Error();
    expect(out.reason).toMatch(/exceeds policy cap/);
    expect(llmCalled).toBe(false); // policy gate caught it before the LLM
  });
});
