import { expect } from "chai";
import hre from "hardhat";
import { keccak256, toBytes, getAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// viem reads/writes can return addresses in mixed checksum forms depending
// on the call path. Normalize both sides via getAddress for comparisons.
const eq = (a: string) => getAddress(a as Hex);

/**
 * T003 — Mock helpers smoke tests.
 *
 * Each helper gets at least one happy-path test plus one adversarial path
 * where applicable. These exist primarily to ensure the helpers themselves
 * compile and behave; the real coverage of PairReviewGate is in T011-T018.
 */
describe("test-helpers (T003)", function () {
  describe("MockERC1271", function () {
    // Hardhat default account #0 private key — well-known, deterministic, OK for tests.
    const PK: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const signer = privateKeyToAccount(PK);
    const MAGIC: Hex = "0x1626ba7e";
    const INVALID: Hex = "0xffffffff";

    it("returns the magic value when the recovered signer matches", async function () {
      const wallet = await hre.viem.deployContract("MockERC1271", [signer.address]);
      const hash = keccak256(toBytes("hello"));
      const sig = await signer.sign({ hash });

      const result = await wallet.read.isValidSignature([hash, sig]);
      expect(result).to.equal(MAGIC);
    });

    it("returns invalid magic when toggleInvalid(true)", async function () {
      const wallet = await hre.viem.deployContract("MockERC1271", [signer.address]);
      await wallet.write.toggleInvalid([true]);
      const hash = keccak256(toBytes("hello"));
      const sig = await signer.sign({ hash });

      const result = await wallet.read.isValidSignature([hash, sig]);
      expect(result).to.equal(INVALID);
    });

    it("returns invalid magic when the signature is from a different signer", async function () {
      const wallet = await hre.viem.deployContract("MockERC1271", [signer.address]);
      const otherSigner = privateKeyToAccount(
        "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
      );
      const hash = keccak256(toBytes("hello"));
      const sig = await otherSigner.sign({ hash });

      const result = await wallet.read.isValidSignature([hash, sig]);
      expect(result).to.equal(INVALID);
    });
  });

  describe("MockIdentityRegistry", function () {
    it("setAgent + IERC8004Identity reads round-trip", async function () {
      const [ownerClient, walletClient] = await hre.viem.getWalletClients();
      if (!ownerClient || !walletClient) throw new Error("expected at least 2 wallets");

      const registry = await hre.viem.deployContract("MockIdentityRegistry");
      await registry.write.setAgent([
        1n,
        ownerClient.account.address,
        walletClient.account.address,
        "ipfs://agent-1",
      ]);

      expect(eq(await registry.read.getAgentWallet([1n]))).to.equal(eq(walletClient.account.address));
      expect(eq(await registry.read.ownerOf([1n]))).to.equal(eq(ownerClient.account.address));
      expect(await registry.read.tokenURI([1n])).to.equal("ipfs://agent-1");
    });

    it("rotateAgentWallet updates only the wallet, not the owner", async function () {
      const [ownerClient, originalWallet, rotatedWallet] = await hre.viem.getWalletClients();
      if (!ownerClient || !originalWallet || !rotatedWallet) {
        throw new Error("expected at least 3 wallets");
      }

      const registry = await hre.viem.deployContract("MockIdentityRegistry");
      await registry.write.setAgent([
        1n,
        ownerClient.account.address,
        originalWallet.account.address,
        "ipfs://a",
      ]);
      await registry.write.rotateAgentWallet([1n, rotatedWallet.account.address]);

      expect(eq(await registry.read.getAgentWallet([1n]))).to.equal(eq(rotatedWallet.account.address));
      expect(eq(await registry.read.ownerOf([1n]))).to.equal(eq(ownerClient.account.address));
    });

    it("register mints sequential agent ids starting at 1", async function () {
      const registry = await hre.viem.deployContract("MockIdentityRegistry");
      await registry.write.register(["ipfs://a"]);
      await registry.write.register(["ipfs://b"]);

      expect(await registry.read.tokenURI([1n])).to.equal("ipfs://a");
      expect(await registry.read.tokenURI([2n])).to.equal("ipfs://b");
    });
  });

  describe("MockValidationAdapter", function () {
    it("postOutcome records the call and exposes it via lastCall + callCount", async function () {
      const adapter = await hre.viem.deployContract("MockValidationAdapter");
      const requestHash = keccak256(toBytes("req-1"));
      const evidenceHash = keccak256(toBytes("evidence-1"));
      const tag = keccak256(toBytes("PairReviewGate.v1"));

      await adapter.write.postOutcome([
        7n, // subjectAgentId
        100, // score
        requestHash,
        "ipfs://e",
        evidenceHash,
        tag,
      ]);

      expect(await adapter.read.callCount()).to.equal(1n);
      const last = await adapter.read.lastCall();
      expect(last.subjectAgentId).to.equal(7n);
      expect(last.score).to.equal(100);
      expect(last.requestHash).to.equal(requestHash);
      expect(last.evidenceURI).to.equal("ipfs://e");
      expect(last.evidenceHash).to.equal(evidenceHash);
      expect(last.tag).to.equal(tag);
    });

    it("callCount tracks multiple postOutcome invocations", async function () {
      const adapter = await hre.viem.deployContract("MockValidationAdapter");
      const tag = keccak256(toBytes("PairReviewGate.v1"));

      for (let i = 1; i <= 3; i++) {
        await adapter.write.postOutcome([
          BigInt(i),
          i === 2 ? 0 : 100, // mix approve/reject
          keccak256(toBytes(`req-${i}`)),
          `ipfs://e-${i}`,
          keccak256(toBytes(`evidence-${i}`)),
          tag,
        ]);
      }

      expect(await adapter.read.callCount()).to.equal(3n);
    });
  });
});
