import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import "solidity-coverage";

const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL ?? "";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? "";
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY ?? "";

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
    apiKey: {
      baseSepolia: BASESCAN_API_KEY,
    },
    customChains: [
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
    ],
  },
};

export default config;
