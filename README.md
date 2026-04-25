# PairReviewGate

> A 2-of-2 agent safety gate built on **ERC-8004**. Two independently-registered agents must both sign before an action executes. Designed to resist prompt injection and unilateral-agent compromise.

ETHGlobal Open Agents · 2026

## 30-second pitch

A single LLM agent that signs your transactions is a single point of failure. Compromise it (prompt injection, jailbreak, supply-chain) and you lose everything.

PairReviewGate splits agent authority across two independently-registered **ERC-8004** agents — a **Proposer** that constructs the action and a **Reviewer** that audits the structured request *without seeing* the Proposer's reasoning. Both must sign EIP-712 typed data before the gate executes anything. Every decision — approve or reject — is posted to the ERC-8004 Validation Registry, building public, attributable agent-pair reputation over time.

It's a security primitive, not a protocol. Any two ERC-8004 agents can be composed into a gate. No new trust assumptions beyond ERC-8004 itself.

## What's in the box

- **Smart contracts** (`src/`): `PairReviewGate.sol` + Validation Registry adapter
- **Tests** (`test/`): full Hardhat (mocha + chai + viem) suite including replay, deadline, operator rotation, ERC-1271 path, reentrancy, and a contract↔frontend EIP-712 cross-reference test
- **Off-chain agents** (`app/agents/`): Proposer (LLM A) + Reviewer (LLM B) on different providers
- **Frontend** (`app/pages/`): Next.js + viem orchestrator
- **CI** (`.github/workflows/ci.yml`): parallel agent-code-review / agent-QA / agent-security-review

## Project status

See [`plan.md`](./plan.md) for timeline, [`prd.json`](./prd.json) for the live task queue, and [`ARCHITECTURE.md`](./ARCHITECTURE.md) for design rationale.

For Claude Code in autonomous mode: read [`CLAUDE.md`](./CLAUDE.md) first.

## Run it locally

```bash
# Install JS deps (pulls Hardhat + toolbox-viem + @openzeppelin/contracts)
pnpm install

# Generate EIP-712 cross-reference fixtures
pnpm fixtures:gen

# Compile + test
pnpm compile
pnpm test

# Coverage (target: > 90% on src/PairReviewGate.sol)
pnpm coverage

# Frontend (after T042)
pnpm dev
```

## Deploy to Base Sepolia

```bash
cp .env.example .env
# Fill in .env, especially canonical 8004 addresses (verify on 8004scan.io)

pnpm hardhat run scripts/deploy.ts --network baseSepolia
pnpm hardhat verify --network baseSepolia <DEPLOYED_ADDRESS> <CONSTRUCTOR_ARGS...>
```

## Standards

| Standard | Role |
|---|---|
| **ERC-8004** | Agent identity + validation registry (mainnet 2026-01-29) |
| **EIP-712** | Typed structured data signing — what both agents sign over |
| **ERC-1271** | Smart-account signature validation — Reviewer can be a contract wallet |
| ~~ERC-8126~~ | Future work — risk-score pre-check on Reviewer |
| ~~ERC-7857~~ | Future work — sealed metadata for Reviewer policy distribution |

## License

MIT
