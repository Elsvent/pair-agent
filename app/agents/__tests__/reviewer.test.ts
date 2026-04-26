import { describe, it, expect } from "vitest";
import { getAddress, hashTypedData, recoverAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  runReviewer,
  ReviewerReasonCode,
  loadPolicyFromJson,
} from "../reviewer";
import type { LLMProvider } from "../proposer";
import type { AgentRequest } from "../../lib/eip712";
import { AGENT_REQUEST_TYPES, buildDomain } from "../../lib/eip712";
import type { ReviewerInput, ReviewerPolicy } from "../../lib/types";

const HARDHAT_PK_1: Hex = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const SWAP_TARGET: Address = "0x0000000000000000000000000000000000005ada";
const BAD_TARGET: Address = "0x000000000000000000000000000000000000bad1";
const SWAP_SELECTOR: Hex = "0x12345678";
const BAD_SELECTOR: Hex = "0xdeadbeef";

const POLICY: ReviewerPolicy = {
  allowedTargets: [SWAP_TARGET],
  maxValueWei: 100_000_000_000_000_000n, // 0.1 ETH
  allowedSelectors: [SWAP_SELECTOR],
  maxRequestsPerMinute: 10,
};

const GATE: Address = "0x5fbdb2315678afecb367f032d93f642f64180aa3";
const CHAIN_ID = 84532;

function buildReq(overrides: Partial<AgentRequest> = {}): AgentRequest {
  return {
    proposerId: 1n,
    reviewerId: 2n,
    target: SWAP_TARGET,
    value: 0n,
    data: (SWAP_SELECTOR + "00".repeat(32)) as Hex,
    nonce: 0n,
    deadline: 1_999_999_999n,
    contextHash: ("0x" + "11".repeat(32)) as Hex,
    ...overrides,
  };
}

class MockLLM implements LLMProvider {
  provider = "mock-reviewer";
  model = "mock-r-1";
  constructor(private responseJson: string) {}
  async complete(_p: string): Promise<string> {
    return this.responseJson;
  }
}

const APPROVE = JSON.stringify({ approve: true, rationale: "looks fine" });
const REJECT = JSON.stringify({ approve: false, rationale: "smells off" });

describe("Reviewer (T041)", () => {
  describe("happy path", () => {
    it("approves a request that passes policy + LLM", async () => {
      const input: ReviewerInput = {
        request: buildReq(),
        policy: POLICY,
        gateAddress: GATE,
        chainId: CHAIN_ID,
      };
      const out = await runReviewer({
        llm: new MockLLM(APPROVE),
        signerKey: HARDHAT_PK_1,
        input,
      });
      if (!out.ok) throw new Error(`expected ok, got reason=${out.reasonCode}`);
      expect(out.ok).toBe(true);
      expect(out.rationale).toMatch(/looks fine/);

      // Signature recovers the reviewer key.
      const expectedSigner = privateKeyToAccount(HARDHAT_PK_1).address;
      const digest = hashTypedData({
        domain: buildDomain(CHAIN_ID, GATE),
        types: AGENT_REQUEST_TYPES,
        primaryType: "AgentRequest",
        message: input.request,
      });
      const recovered = await recoverAddress({ hash: digest, signature: out.signature });
      expect(getAddress(recovered)).toBe(getAddress(expectedSigner));
    });
  });

  describe("policy gate", () => {
    it("rejects a target not in the allowlist", async () => {
      const input: ReviewerInput = {
        request: buildReq({ target: BAD_TARGET }),
        policy: POLICY,
        gateAddress: GATE,
        chainId: CHAIN_ID,
      };
      const out = await runReviewer({ llm: new MockLLM(APPROVE), signerKey: HARDHAT_PK_1, input });
      expect(out.ok).toBe(false);
      if (out.ok) throw new Error();
      expect(out.reasonCode).toBe(ReviewerReasonCode.TargetNotAllowed);
    });

    it("rejects a value over the cap", async () => {
      const overCap = POLICY.maxValueWei + 1n;
      const input: ReviewerInput = {
        request: buildReq({ value: overCap }),
        policy: POLICY,
        gateAddress: GATE,
        chainId: CHAIN_ID,
      };
      const out = await runReviewer({ llm: new MockLLM(APPROVE), signerKey: HARDHAT_PK_1, input });
      expect(out.ok).toBe(false);
      if (out.ok) throw new Error();
      expect(out.reasonCode).toBe(ReviewerReasonCode.ValueOverCap);
    });

    it("rejects a selector not in the allowlist", async () => {
      const badData = (BAD_SELECTOR + "00".repeat(32)) as Hex;
      const input: ReviewerInput = {
        request: buildReq({ data: badData }),
        policy: POLICY,
        gateAddress: GATE,
        chainId: CHAIN_ID,
      };
      const out = await runReviewer({ llm: new MockLLM(APPROVE), signerKey: HARDHAT_PK_1, input });
      expect(out.ok).toBe(false);
      if (out.ok) throw new Error();
      expect(out.reasonCode).toBe(ReviewerReasonCode.SelectorNotAllowed);
    });

    it("rejects req.data shorter than 4 bytes when selector allowlist is set", async () => {
      const input: ReviewerInput = {
        request: buildReq({ data: "0x12" as Hex }),
        policy: POLICY,
        gateAddress: GATE,
        chainId: CHAIN_ID,
      };
      const out = await runReviewer({ llm: new MockLLM(APPROVE), signerKey: HARDHAT_PK_1, input });
      expect(out.ok).toBe(false);
      if (out.ok) throw new Error();
      expect(out.reasonCode).toBe(ReviewerReasonCode.SelectorNotAllowed);
    });
  });

  describe("LLM gate", () => {
    it("rejects when the LLM disapproves even if policy passes", async () => {
      const input: ReviewerInput = {
        request: buildReq(),
        policy: POLICY,
        gateAddress: GATE,
        chainId: CHAIN_ID,
      };
      const out = await runReviewer({ llm: new MockLLM(REJECT), signerKey: HARDHAT_PK_1, input });
      expect(out.ok).toBe(false);
      if (out.ok) throw new Error();
      expect(out.reasonCode).toBe(ReviewerReasonCode.LLMRejected);
      expect(out.reason).toMatch(/smells off/);
    });

    it("throws on malformed LLM JSON", async () => {
      const input: ReviewerInput = {
        request: buildReq(),
        policy: POLICY,
        gateAddress: GATE,
        chainId: CHAIN_ID,
      };
      await expect(
        runReviewer({ llm: new MockLLM("not-json"), signerKey: HARDHAT_PK_1, input }),
      ).rejects.toThrow(/non-JSON/);
    });
  });

  describe("loadPolicyFromJson", () => {
    it("parses raw JSON shape into typed ReviewerPolicy", () => {
      const raw = {
        allowedTargets: [SWAP_TARGET as string],
        maxValueWei: "1000000000000000000",
        allowedSelectors: [SWAP_SELECTOR as string],
        maxRequestsPerMinute: 5,
      };
      const policy = loadPolicyFromJson(raw);
      expect(policy.maxValueWei).toBe(1_000_000_000_000_000_000n);
      expect(policy.allowedTargets[0]).toBe(SWAP_TARGET);
      expect(policy.allowedSelectors[0]).toBe(SWAP_SELECTOR);
      expect(policy.maxRequestsPerMinute).toBe(5);
    });

    it("defaults maxRequestsPerMinute to 10 when absent", () => {
      const raw = {
        allowedTargets: [],
        maxValueWei: "0",
        allowedSelectors: [],
      };
      const policy = loadPolicyFromJson(raw);
      expect(policy.maxRequestsPerMinute).toBe(10);
    });
  });
});
