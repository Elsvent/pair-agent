# Instructions for Claude Code

This file is the project's operating manual. Read it at the start of every session.

## What you are building

PairReviewGate: a 2-of-2 agent safety gate on ERC-8004. Two independently-registered agents (Proposer + Reviewer) must both sign an EIP-712 typed payload before an on-chain action executes. Designed to resist prompt injection.

See `ARCHITECTURE.md` for full design. See `plan.md` for timeline. See `prd.json` for the live task queue.

## Project rules — non-negotiable

### Rule 1 — Never invent the ERC-8004 interface

`src/interfaces/IERC8004Identity.sol` and `src/interfaces/IERC8004Validation.sol` are **placeholders** until task **T001** freezes them from the canonical deployed contracts on `8004scan.io`.

- Do **not** add fields, methods, or modifiers to those files.
- If you need a method that isn't there, surface a new task in `prd.json` and STOP.
- After T001 lands, treat those files as immutable.

### Rule 2 — Tests-first, always

Every contract change is motivated by a failing test, or maintains an existing passing test. If you find yourself writing implementation before a test exists for what you're building, stop and write the test first.

### Rule 3 — EIP-712 digest computation must cross-reference

The contract-side EIP-712 digest (`_hashTypedDataV4`) and the frontend-side digest (viem `hashTypedData`) must produce identical bytes. The test `test/EIP712Reference.test.ts` enforces this: it deploys `PairReviewGate`, calls its on-chain `digestOf(...)` view, and asserts byte-for-byte equality against the digest computed by `app/lib/eip712.ts` via `viem.hashTypedData`. Fixtures live in `test/fixtures/eip712.json`.

If you change the `AgentRequest` struct in any way:

- Update the struct in `src/PairReviewGate.sol`
- Update the typed-data schema in `app/lib/eip712.ts`
- Regenerate fixtures with `pnpm fixtures:gen`
- The cross-reference test must still pass

### Rule 4 — No memorized OpenZeppelin APIs

OpenZeppelin has API drift across versions. We pin a specific version in `package.json` (`@openzeppelin/contracts`). Always check the actual file in `node_modules/@openzeppelin/contracts/` before importing or calling. If the API doesn't match what you remember, trust the file, not your memory.

### Rule 5 — Operator resolution at execution time

`PairReviewGate.execute()` MUST call `IIdentityRegistry.operatorOf(agentId)` at execution time. Do **not** cache, pre-resolve, or pass operator addresses as parameters. This is a security property, enforced by `test/OperatorRotation.test.ts`.

### Rule 6 — Reentrancy

`PairReviewGate.execute()` makes an external call. Use checks-effects-interactions **and** `nonReentrant`. Both. Belt and suspenders. The reentrancy attacker test in `test/PairReviewGate.test.ts` must stay green.

### Rule 7 — No Validation Registry calls outside the adapter

`PairReviewGate` talks to ERC-8004 Validation Registry only through `IValidationAdapter`. Never import the registry interface directly into `PairReviewGate.sol`. The adapter exists so we can swap registry versions without touching the gate.

## File layout

```
src/                  # Solidity sources (Hardhat compiles everything under here)
  PairReviewGate.sol
  adapters/ValidationAdapterV1.sol
  interfaces/
    IPairReviewGate.sol
    IERC8004Identity.sol     ← frozen after T001
    IERC8004Validation.sol   ← frozen after T001
    IValidationAdapter.sol
  test-helpers/               ← Solidity-only test fixtures (compiled, not deployed in prod)
    MockERC1271.sol
    MockIdentityRegistry.sol
    MockValidationAdapter.sol

test/                 # Hardhat (mocha) TypeScript tests
  helpers/
    signing.ts                ← canonical EIP-712 signing helper (viem signTypedData)
  fixtures/
    eip712.json
  EIP712Reference.test.ts     ← cross-reference test (do not skip)
  PairReviewGate.test.ts
  OperatorRotation.test.ts
  ValidationAdapterV1.test.ts

scripts/
  deploy.ts                   ← Hardhat deploy for Base Sepolia (Hardhat Ignition optional)

hardhat.config.ts             ← solc 0.8.24, optimizer 200, src=src, tests=test, baseSepolia network

app/                  # Next.js + TS off-chain
  lib/
    eip712.ts                 ← matches contract digest exactly
    contracts.ts              ← viem clients
    types.ts
  agents/
    proposer.ts
    reviewer.ts
  pages/
    index.tsx

.github/workflows/
  ci.yml                      ← parallel agent-* jobs
```

## Coding conventions

### Solidity

- Solidity `^0.8.24`
- `pragma` per file
- NatSpec on every external/public function
- Custom errors over revert strings: `error Foo(uint256 expected, uint256 actual);`
- No `tx.origin`
- Named imports only: `import {Foo} from "...";`
- Indexed events for: agent ids, addresses, request hashes
- Internal functions prefixed `_`; private state without prefix
- No `console.log` outside `test/`

### TypeScript

- Strict mode on
- No `any` without `// eslint-disable-next-line` and a reason
- Use `viem` for all chain interaction. No ethers.
- Shared types live in `app/lib/types.ts`; do not duplicate

## Test conventions

- Filename: `<Subject>.test.ts` (Hardhat + mocha + chai-matchers, viem-flavor)
- Use `describe(...)` blocks per scenario group, `it(...)` per case
- Naming: `it("executes the happy path", ...)`, `it("reverts when nonce already used", ...)` — natural English
- Custom errors: `await expect(tx).to.be.revertedWithCustomError(gate, "BadNonce").withArgs(0n, 1n)`
- Time/block manipulation: use `@nomicfoundation/hardhat-network-helpers` (`time.increase`, `mine`, `loadFixture`)
- Snapshot setup with `loadFixture` for fast resets
- Solidity helper contracts go in `src/test-helpers/` (Hardhat compiles a single source root)
- Use `viem` clients via `@nomicfoundation/hardhat-viem` (`hre.viem.deployContract`, `hre.viem.getWalletClients()`); no ethers
- One assertion concept per test; multiple `expect(...).to.equal(...)` for the same concept is fine

## Working with prd.json

`prd.json` is the live task queue. Each task has:

- `id`: stable string like `T001`
- `title`: one-line summary
- `phase`: `0` through `5`
- `priority`: `blocker` | `must` | `should` | `nice`
- `depends_on`: array of task ids that must be `done` before this can start
- `acceptance`: array of bullet points; all must be true
- `files`: paths likely to change
- `status`: `todo` | `in_progress` | `needs_human_review` | `blocked` | `done`
- `notes`: free-form

### Workflow per task

1. Pick the next `todo` whose `depends_on` are all `done`. Prefer lower `id` to reduce branching.
2. Set `status: in_progress` in `prd.json` and commit (commit message: `[T### in-progress] <title>`).
3. Implement, with tests-first.
4. Run locally:
   ```
   pnpm compile          # hardhat compile
   pnpm test             # hardhat test (mocha) — all .test.ts files
   pnpm test:ts          # vitest — pure TS unit tests under app/agents/__tests__
   pnpm coverage         # solidity-coverage — needed before T020
   ```
   Everything must pass.
5. Set `status: needs_human_review`; open PR titled `[T###] <title>`.
6. After human approval and merge, set `status: done` in a follow-up doc-only commit.

### When you cannot complete a task

Set `status: blocked`, add a `notes` field explaining what's missing, surface the blocker as a new task with appropriate `priority`, and STOP. Do not work around the block by inventing data or interfaces.

## Things NOT to do

- Do **not** modify `ARCHITECTURE.md` without a `[docs]`-prefixed PR.
- Do **not** add new dependencies without surfacing a task in `prd.json`.
- Do **not** edit `src/interfaces/IERC8004*.sol` after T001 marks them frozen.
- Do **not** use `console.log` outside of tests.
- Do **not** swallow errors. Bubble or revert with a custom error.
- Do **not** add gasless / meta-tx features. Out of scope.
- Do **not** touch ERC-8126 or ERC-7857 code paths. Future work.
- Do **not** "optimize" by caching `operatorOf` results in `PairReviewGate`.
- Do **not** change the EIP-712 domain string. It must remain `name="PairReviewGate"`, `version="1"`.

## Demo readiness rule

After each phase completes, run the demo script end-to-end. If it breaks, that's the next task — not new features.

## On uncertainty

If you are not sure about an ERC-8004 detail, an OZ API, or what the user actually wants — STOP and surface the question in `prd.json` as a new `blocker` task. Do not guess. The cost of a 1-day delay is much smaller than the cost of a deploy-day surprise.
