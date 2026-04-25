# PairReviewGate — Implementation Plan

## Status

- Today: 2026-04-25
- Hackathon: ETHGlobal Open Agents (2026-04-24 → 2026-05-06)
- Available days: ~10 working days
- Team: 2 technical founders + Claude Code (autonomous mode via Ralph loop)
- Architecture: see [ARCHITECTURE.md](./ARCHITECTURE.md)

## Goal

Ship a working **ERC-8004-native 2-of-2 agent safety gate** on Base Sepolia, with:

- Smart contracts: `PairReviewGate` + Validation Registry adapter
- Two independently-running agents (Proposer + Reviewer) on different LLM providers
- Demo dApp showing one happy-path execution and one blocked prompt-injection attack
- Pair-review outcomes posted to ERC-8004 Validation Registry for every decision
- Demo video (≤ 4 min)

## Out of scope (future work in ARCHITECTURE.md §10)

- ERC-8126 risk-score pre-check
- ERC-7857 sealed metadata
- m-of-n quorum
- TEE-attested operator keys

## Success criteria

### Must-have (blocks submission if missing)

1. `PairReviewGate.sol` deployed and verified on Base Sepolia
2. Both agent NFTs minted on ERC-8004 Identity Registry with cards on IPFS
3. End-to-end happy path: user → both agents sign → execute → Validation Registry write
4. Prompt-injection demo: Proposer compromised, Reviewer rejects, Validation entry posted
5. README + ARCHITECTURE on GitHub + demo video

### Should-have

6. Test coverage > 90% on `PairReviewGate.sol` (`pnpm coverage`)
7. ERC-1271 (smart account) Reviewer path tested on-chain
8. Block-explorer link to a live Validation entry shown in the demo

### Nice-to-have

9. Indexer dashboard showing pair history and outcome counts
10. Fork test against actual deployed ERC-8004 on Base Sepolia

## Phases & daily targets

### Phase 0 — Foundation (Day 1)

**Blocker tasks before any other work begins.**

- Repo initialized; Hardhat + `@nomicfoundation/hardhat-toolbox-viem` + `@openzeppelin/contracts` pinned in `package.json`
- **ERC-8004 interfaces frozen from `8004scan.io`** (T001 — non-negotiable)
- Hardhat tests passing on baseline mocks (`pnpm compile && pnpm test`)
- CI green (parallel agent-review / agent-QA / agent-security-review jobs)

### Phase 1 — Core contract (Days 2–3)

- `PairReviewGate.sol` implemented to spec
- All Hardhat tests green: replay, deadline, operator rotation, ERC-1271, contextHash binding, reentrancy

### Phase 2 — Validation adapter & deploy (Day 4)

- `ValidationAdapterV1` implemented and integration-tested
- Deploy script working on Base Sepolia
- Both agent NFTs minted with cards on IPFS

### Phase 3 — Off-chain agents (Days 5–6)

- Proposer agent (LLM A) built
- Reviewer agent (LLM B) built with policy module
- Frontend orchestrator (Next.js + viem) wired up
- Cross-reference test still green

### Phase 4 — Demo wiring & hardening (Days 7–8)

- Happy-path demo end-to-end on Base Sepolia
- Prompt-injection attack scripted, reproducible, deterministic seed
- Indexer / dashboard reading events from Validation Registry

### Phase 5 — Polish (Days 9–10)

- Demo video recorded
- README polished with one-paragraph judge pitch
- Final security pass (slither + manual)
- ETHGlobal submission filed

## Risk register

| # | Risk | Mitigation |
|---|------|------------|
| 1 | ERC-8004 interface guessed wrong | T001 freezes from `8004scan.io` before any other work; placeholder file marked DO-NOT-TRUST |
| 2 | EIP-712 digest mismatch contract↔frontend | `test/EIP712Reference.test.ts` cross-reference test must stay green at every commit |
| 3 | Validation Registry version differs on testnet | Adapter pattern; verify version at deploy time |
| 4 | Reviewer too permissive (signs everything) | Policy unit tests with adversarial cases before LLM-driven Reviewer ships |
| 5 | LLM provider rate-limited mid-demo | Pre-cache representative responses; fallback model |
| 6 | Operator-rotation security property silently broken by "optimization" | Explicit test asserting rotation invalidates in-flight sigs |
| 7 | LLM hallucinates contract logic | Tests-first, agent-security-review CI rejects PRs that break tests |
| 8 | Reentrancy regression on `execute()` | `nonReentrant` + checks-effects-interactions; reentrancy attacker test |

## Demo script (target ≤ 4 min)

| Time | Beat |
|---|---|
| 00:00 | Problem framing — single-agent compromise = full compromise (30s) |
| 00:30 | Show two agents on `8004scan.io`, distinct NFTs, distinct operators (15s) |
| 00:45 | Happy path — legit swap, both sign, execute, Validation entry on explorer (60s) |
| 01:45 | Attack — malicious tool description prompt-injects Proposer (45s) |
| 02:30 | Reviewer (different LLM, no Proposer rationale) refuses to sign (30s) |
| 03:00 | Validation Registry entry posted with reason (15s) |
| 03:15 | Architecture recap + future work (30s) |
| 03:45 | Close |

## How to use this scaffold

1. Read this file, then `CLAUDE.md`, then `ARCHITECTURE.md`.
2. `prd.json` is the live task queue. Pick the next `TODO` whose deps are all `DONE`.
3. Every PR title starts with `[T###]`.
4. Every PR must keep CI green and all tests passing.
5. Never edit `src/interfaces/IERC8004*.sol` after T001 marks them frozen.
