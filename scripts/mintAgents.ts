// scripts/mintAgents.ts
//
// Mint the Proposer + Reviewer agent NFTs on the canonical Base Sepolia
// IdentityRegistry, using the cards in app/agent-cards/{proposer,reviewer}.json
// pinned to IPFS.
//
// Run via:
//   pnpm hardhat run scripts/mintAgents.ts --network baseSepolia
//
// Requires the deploy manifest at deployments/base-sepolia.json (T031 must
// have run successfully) and an IPFS pinning service token in env:
//   PINATA_JWT or WEB3_STORAGE_TOKEN  (only one is needed)

import hre from "hardhat";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { type Address, type Hex, parseAbi } from "viem";

const MANIFEST_PATH = "deployments/base-sepolia.json";

const IDENTITY_REGISTRY_ABI = parseAbi([
  "function register(string agentURI) external returns (uint256 agentId)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
]);

interface Manifest {
  identityRegistry?: Address;
  validationAdapter?: Address;
  agentCards?: { proposer?: string; reviewer?: string };
  agentTokenIds?: { proposer?: number; reviewer?: number };
  txHashes?: { [k: string]: Hex };
}

async function pinJSONFile(path: string): Promise<string> {
  const json = JSON.parse(readFileSync(path, "utf8"));
  const pinataJWT = process.env.PINATA_JWT;
  const web3Token = process.env.WEB3_STORAGE_TOKEN;

  if (pinataJWT) {
    const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pinataJWT}`,
      },
      body: JSON.stringify({ pinataContent: json }),
    });
    if (!res.ok) throw new Error(`Pinata pin failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { IpfsHash: string };
    return `ipfs://${body.IpfsHash}`;
  }

  if (web3Token) {
    // web3.storage's API differs — it expects a multipart upload. Stub:
    throw new Error("web3.storage upload not implemented; use PINATA_JWT for now");
  }

  throw new Error("Set PINATA_JWT (or WEB3_STORAGE_TOKEN) in .env to pin agent cards");
}

async function main() {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`${MANIFEST_PATH} not found — run scripts/deploy.ts first`);
  }
  const manifest: Manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  if (!manifest.identityRegistry) throw new Error("manifest missing identityRegistry");

  const publicClient = await hre.viem.getPublicClient();
  const [deployer] = await hre.viem.getWalletClients();
  if (!deployer) throw new Error("no deployer — check DEPLOYER_PRIVATE_KEY");

  manifest.agentCards = manifest.agentCards ?? {};
  manifest.agentTokenIds = manifest.agentTokenIds ?? {};
  manifest.txHashes = manifest.txHashes ?? {};

  // 1. Pin agent cards.
  if (!manifest.agentCards.proposer) {
    console.log("pinning proposer card to IPFS...");
    manifest.agentCards.proposer = await pinJSONFile("app/agent-cards/proposer.json");
    console.log(`  ${manifest.agentCards.proposer}`);
  }
  if (!manifest.agentCards.reviewer) {
    console.log("pinning reviewer card to IPFS...");
    manifest.agentCards.reviewer = await pinJSONFile("app/agent-cards/reviewer.json");
    console.log(`  ${manifest.agentCards.reviewer}`);
  }

  // 2. Mint Proposer NFT.
  if (!manifest.agentTokenIds.proposer) {
    console.log("minting Proposer agent NFT...");
    const txHash = await deployer.writeContract({
      address: manifest.identityRegistry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "register",
      args: [manifest.agentCards.proposer!],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    const log = receipt.logs.find((l) => l.address.toLowerCase() === manifest.identityRegistry!.toLowerCase());
    if (!log || !log.topics[1]) throw new Error("Registered event not found");
    manifest.agentTokenIds.proposer = Number(BigInt(log.topics[1]));
    manifest.txHashes["proposer.register"] = txHash;
    console.log(`  Proposer agentId=${manifest.agentTokenIds.proposer} tx=${txHash}`);
  }

  // 3. Mint Reviewer NFT.
  if (!manifest.agentTokenIds.reviewer) {
    console.log("minting Reviewer agent NFT...");
    const txHash = await deployer.writeContract({
      address: manifest.identityRegistry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "register",
      args: [manifest.agentCards.reviewer!],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    const log = receipt.logs.find((l) => l.address.toLowerCase() === manifest.identityRegistry!.toLowerCase());
    if (!log || !log.topics[1]) throw new Error("Registered event not found");
    manifest.agentTokenIds.reviewer = Number(BigInt(log.topics[1]));
    manifest.txHashes["reviewer.register"] = txHash;
    console.log(`  Reviewer agentId=${manifest.agentTokenIds.reviewer} tx=${txHash}`);
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\nwrote ${MANIFEST_PATH}`);

  console.log(`\nNext step: run setAgentWallet for each agent so the gate's`);
  console.log(`getAgentWallet returns the operator address. The setAgentWallet`);
  console.log(`call requires an EIP-712 signature from the agent owner over`);
  console.log(`(agentId, newWallet, deadline). Implement in scripts/setAgentWallets.ts`);
  console.log(`or do it manually via cast/etherscan with the canonical EIP-712 domain.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
