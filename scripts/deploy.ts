// scripts/deploy.ts
//
// Deploy PairReviewGate + ValidationAdapterV1 + ValidationRegistryV0 on
// Base Sepolia. Idempotent: re-running with the same env reads existing
// addresses from deployments/base-sepolia.json and skips deploys.
//
// Run via:
//   pnpm hardhat run scripts/deploy.ts --network baseSepolia
//
// Required env (from .env):
//   BASE_SEPOLIA_RPC_URL
//   DEPLOYER_PRIVATE_KEY    (funded with Base Sepolia ETH)
//   BASESCAN_API_KEY        (only for the verify step printed at the end)
//
// Optional env:
//   ERC8004_IDENTITY_ADDRESS (default: canonical 0x8004A818BFB912233c491871b3d84c89A494BD9e)

import hre from "hardhat";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { type Address, type Hex } from "viem";

interface DeploymentManifest {
  network: string;
  chainId: number;
  deployer?: Address;
  identityRegistry?: Address;       // canonical 8004 (existing on Base Sepolia)
  validationRegistry?: Address;     // ours (deployed by this script)
  validationAdapter?: Address;      // ours
  pairReviewGate?: Address;         // ours
  txHashes?: { [key: string]: Hex };
  blockNumbers?: { [key: string]: number };
  agentCards?: { proposer?: string; reviewer?: string }; // ipfs:// URIs (T032 fills these)
  agentTokenIds?: { proposer?: number; reviewer?: number };
  exampleTxHashes?: { happyPath?: Hex; rejection?: Hex };
}

const MANIFEST_PATH = "deployments/base-sepolia.json";
const CANONICAL_IDENTITY: Address = "0x8004A818BFB912233c491871b3d84c89A494BD9e";

function loadManifest(): DeploymentManifest {
  if (existsSync(MANIFEST_PATH)) {
    return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as DeploymentManifest;
  }
  return { network: "base-sepolia", chainId: 84532, txHashes: {}, blockNumbers: {} };
}

function saveManifest(m: DeploymentManifest) {
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2) + "\n");
}

async function main() {
  const network = hre.network.name;
  const publicClient = await hre.viem.getPublicClient();
  const [deployer] = await hre.viem.getWalletClients();
  if (!deployer) throw new Error("no deployer wallet — check DEPLOYER_PRIVATE_KEY in .env");

  const chainId = await publicClient.getChainId();
  if (network === "baseSepolia" && chainId !== 84532) {
    throw new Error(`expected chainId 84532 for baseSepolia, got ${chainId}`);
  }
  console.log(`network=${network} chainId=${chainId} deployer=${deployer.account.address}`);

  const manifest = loadManifest();
  manifest.network = "base-sepolia";
  manifest.chainId = chainId;
  manifest.deployer = deployer.account.address;
  manifest.identityRegistry =
    manifest.identityRegistry ??
    ((process.env.ERC8004_IDENTITY_ADDRESS ?? CANONICAL_IDENTITY) as Address);
  manifest.txHashes = manifest.txHashes ?? {};
  manifest.blockNumbers = manifest.blockNumbers ?? {};

  console.log(`identityRegistry (canonical 8004): ${manifest.identityRegistry}`);

  // 1. ValidationRegistryV0 — our deploy of the canonical body, single-step init.
  if (!manifest.validationRegistry) {
    console.log("deploying ValidationRegistryV0...");
    const registry = await hre.viem.deployContract("ValidationRegistryV0");
    const initTx = await registry.write.initialize_v0([manifest.identityRegistry!]);
    const initReceipt = await publicClient.waitForTransactionReceipt({ hash: initTx });
    manifest.validationRegistry = registry.address;
    manifest.txHashes["validationRegistry.initialize_v0"] = initTx;
    manifest.blockNumbers["validationRegistry"] = Number(initReceipt.blockNumber);
    console.log(`  ${registry.address}`);
  } else {
    console.log(`validationRegistry already deployed: ${manifest.validationRegistry}`);
  }

  // 2. ValidationAdapterV1 — wraps our ValidationRegistryV0 in IValidationAdapter.
  if (!manifest.validationAdapter) {
    console.log("deploying ValidationAdapterV1...");
    const adapter = await hre.viem.deployContract("ValidationAdapterV1", [
      manifest.validationRegistry!,
    ]);
    manifest.validationAdapter = adapter.address;
    const code = await publicClient.getCode({ address: adapter.address });
    if (!code) throw new Error("adapter has no code post-deploy");
    console.log(`  ${adapter.address}`);
  } else {
    console.log(`validationAdapter already deployed: ${manifest.validationAdapter}`);
  }

  // 3. PairReviewGate — points at canonical IdentityRegistry + our adapter.
  if (!manifest.pairReviewGate) {
    console.log("deploying PairReviewGate...");
    const gate = await hre.viem.deployContract("PairReviewGate", [
      manifest.identityRegistry!,
      manifest.validationAdapter!,
    ]);
    manifest.pairReviewGate = gate.address;
    console.log(`  ${gate.address}`);
  } else {
    console.log(`pairReviewGate already deployed: ${manifest.pairReviewGate}`);
  }

  saveManifest(manifest);
  console.log(`\nwrote ${MANIFEST_PATH}`);

  // Verification commands.
  console.log(`\nVerification (run after a few blocks settle):`);
  console.log(
    `  pnpm hardhat verify --network baseSepolia ${manifest.validationRegistry} `,
  );
  console.log(
    `  pnpm hardhat verify --network baseSepolia ${manifest.validationAdapter} ${manifest.validationRegistry}`,
  );
  console.log(
    `  pnpm hardhat verify --network baseSepolia ${manifest.pairReviewGate} ${manifest.identityRegistry} ${manifest.validationAdapter}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
