import { defineConfig } from "vitest/config";

// Vitest is for the off-chain TS code under app/ only. The chain-side test
// suite under test/ runs in the Hardhat (mocha + chai-matchers + viem) world
// and does not work in vitest's environment.
export default defineConfig({
  test: {
    include: ["app/**/__tests__/**/*.test.ts", "app/**/*.test.ts"],
    exclude: ["node_modules", "test/**", "artifacts/**", "cache/**", "coverage/**"],
  },
});
