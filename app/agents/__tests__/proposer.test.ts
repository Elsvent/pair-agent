import { describe, it, expect } from "vitest";
import { encodeFunctionData, getAddress, hashTypedData, recoverAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { runProposer, type LLMProvider } from "../proposer";
import { AGENT_REQUEST_TYPES, buildDomain } from "../../lib/eip712";
import type { ProposerInput, ToolDescriptor } from "../../lib/types";

const HARDHAT_PK_0: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const SWAP_SELECTOR = "0x12345678" as Hex;
const SWAP_TARGET: Address = "0x0000000000000000000000000000000000005ada";

const TOOL_CATALOG: ToolDescriptor[] = [
  {
    name: "swapExact",
    description: "Swap an exact amount of token A for token B",
    selector: SWAP_SELECTOR,
    target: SWAP_TARGET,
  },
];

const BASE_INPUT: ProposerInput = {
  intent: "swap 100 USDC for ETH",
  toolCatalog: TOOL_CATALOG,
  pairNonce: 0n,
  proposerId: 1n,
  reviewerId: 2n,
  gateAddress: "0x5fbdb2315678afecb367f032d93f642f64180aa3" as Address,
  chainId: 84532,
};

const SAMPLE_DATA: Hex = "0x12345678abcdef";

class MockLLM implements LLMProvider {
  provider = "mock";
  model = "mock-1";
  constructor(private responseJson: string) {}
  async complete(_prompt: string): Promise<string> {
    return this.responseJson;
  }
}

describe("Proposer (T040)", () => {
  it("produces a deterministic AgentRequest with a valid signature", async () => {
    const llmJson = JSON.stringify({
      selectedTool: "swapExact",
      target: SWAP_TARGET,
      value: "0",
      data: SAMPLE_DATA,
      rationale: "User wants 100 USDC -> ETH; swapExact is the matching tool.",
    });
    const llm = new MockLLM(llmJson);
    const deadline = 1_999_999_999n;
    const contextHash: Hex = ("0x" + "11".repeat(32)) as Hex;

    const out = await runProposer({
      llm,
      signerKey: HARDHAT_PK_0,
      input: BASE_INPUT,
      deadline,
      contextHash,
    });

    expect(out.request.proposerId).toBe(1n);
    expect(out.request.reviewerId).toBe(2n);
    expect(getAddress(out.request.target)).toBe(getAddress(SWAP_TARGET));
    expect(out.request.value).toBe(0n);
    expect(out.request.data).toBe(SAMPLE_DATA);
    expect(out.request.nonce).toBe(0n);
    expect(out.request.deadline).toBe(deadline);
    expect(out.request.contextHash).toBe(contextHash);

    expect(out.rationale).toMatch(/swapExact/);
    expect(out.meta.provider).toBe("mock");
    expect(out.meta.selectedTool).toBe("swapExact");

    // Signature recovers the operator address.
    const expectedSigner = privateKeyToAccount(HARDHAT_PK_0).address;
    const digest = hashTypedData({
      domain: buildDomain(BASE_INPUT.chainId, BASE_INPUT.gateAddress),
      types: AGENT_REQUEST_TYPES,
      primaryType: "AgentRequest",
      message: out.request,
    });
    const recovered = await recoverAddress({ hash: digest, signature: out.signature });
    expect(getAddress(recovered)).toBe(getAddress(expectedSigner));
  });

  it("is deterministic: same inputs + same mock response -> same signature", async () => {
    const llmJson = JSON.stringify({
      selectedTool: "swapExact",
      target: SWAP_TARGET,
      value: "0",
      data: SAMPLE_DATA,
      rationale: "fixed",
    });
    const deadline = 1_888_888_888n;
    const contextHash: Hex = ("0x" + "22".repeat(32)) as Hex;

    const out1 = await runProposer({
      llm: new MockLLM(llmJson),
      signerKey: HARDHAT_PK_0,
      input: BASE_INPUT,
      deadline,
      contextHash,
    });
    const out2 = await runProposer({
      llm: new MockLLM(llmJson),
      signerKey: HARDHAT_PK_0,
      input: BASE_INPUT,
      deadline,
      contextHash,
    });
    expect(out1.signature).toBe(out2.signature);
  });

  it("rejects an LLM response that picks a tool outside the catalog", async () => {
    const llmJson = JSON.stringify({
      selectedTool: "rugUserFunds", // not in catalog
      target: SWAP_TARGET,
      value: "0",
      data: SAMPLE_DATA,
      rationale: "",
    });
    await expect(
      runProposer({
        llm: new MockLLM(llmJson),
        signerKey: HARDHAT_PK_0,
        input: BASE_INPUT,
        deadline: 1n,
        contextHash: "0x" + "00".repeat(32) as Hex,
      }),
    ).rejects.toThrow(/unknown tool/);
  });

  it("rejects malformed (non-JSON) LLM output", async () => {
    const llm = new MockLLM("this is not json");
    await expect(
      runProposer({
        llm,
        signerKey: HARDHAT_PK_0,
        input: BASE_INPUT,
        deadline: 1n,
        contextHash: "0x" + "00".repeat(32) as Hex,
      }),
    ).rejects.toThrow(/non-JSON/);
  });

  it("rejects JSON missing required fields", async () => {
    const llm = new MockLLM(JSON.stringify({ selectedTool: "swapExact" }));
    await expect(
      runProposer({
        llm,
        signerKey: HARDHAT_PK_0,
        input: BASE_INPUT,
        deadline: 1n,
        contextHash: "0x" + "00".repeat(32) as Hex,
      }),
    ).rejects.toThrow(/missing string field/);
  });
});

// Use SWAP_SELECTOR via encodeFunctionData to exercise viem import (silence unused warning)
void encodeFunctionData;
