import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import "solidity-coverage";

const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL ?? "";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? "";
// Etherscan V2 (Jan 2024+) unified all chain explorers under a single API
// key issued at https://etherscan.io/myapikey. The same key verifies on
// Basescan, Arbiscan, Polygonscan, Optimistic Etherscan, etc. The legacy
// BASESCAN_API_KEY env var is accepted as a fallback so older .env files
// don't break.
const ETHERSCAN_API_KEY =
  process.env.ETHERSCAN_API_KEY ?? process.env.BASESCAN_API_KEY ?? "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // execute() has 8 locals + calldata struct (8 fields) + return — Yul stack
      // is the only way through without splitting the function. viaIR also
      // gives better optimizer output.
      viaIR: true,
    },
  },
  paths: {
    sources: "src",
    tests: "test",
    cache: "cache",
    artifacts: "artifacts",
  },
  networks: {
    hardhat: {
      // chainId pinned to Base Sepolia (84532) so EIP-712 fixtures stay valid
      // across gen-fixtures.ts and test/EIP712Reference.test.ts. The TS-side
      // domain (buildDomain(chainId, addr)) and the contract-side domainSeparator
      // both depend on chainId; locking it removes a drift vector.
      chainId: 84532,
    },
    baseSepolia: {
      url: BASE_SEPOLIA_RPC_URL,
      chainId: 84532,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    // Single key from etherscan.io/myapikey — V2 multichain.
    apiKey: {
      baseSepolia: ETHERSCAN_API_KEY,
    },
    customChains: [
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          // V2 endpoint — chain selected via ?chainid=<id>. Replaces the legacy
          // chain-specific endpoint (api-sepolia.basescan.org/api).
          apiURL: "https://api.etherscan.io/v2/api?chainid=84532",
          browserURL: "https://sepolia.basescan.org",
        },
      },
    ],
  },
};

export default config;
