# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ORE Smart Bot - A Hexagonal Architecture + DDD refactor of an ORE Protocol mining bot. Monitors ORE rounds on Solana, evaluates placement opportunities based on Expected Value (EV), and automatically places stakes, checkpoints, and claims rewards.

## Commands

```bash
# Build all workspaces
yarn build
yarn build:domain
yarn build:config
yarn build:bot

# Test
yarn test
yarn test:domain

# Type check and lint
yarn check
yarn lint:fix
yarn format:fix

# Run the bot
yarn start           # Production
yarn dev             # Watch mode
```

## Architecture

### Monorepo Structure
```
/
├── packages/
│   ├── domain/       # Pure business logic (DDD)
│   └── config/       # Configuration + Zod schemas
└── apps/
    └── bot/          # Hexagonal adapters + orchestration
```

### Layers (inside-out)

**Domain** - Pure TypeScript, no dependencies on outer layers
- Aggregates: Board, Round, Miner (entity clusters with invariants)
- Value Objects: Lamports, RoundId, Slot, OrePrice, StakeAmount (validated)
- Events: RoundStarted, RoundEnded, PlacementExecuted, etc.
- Ports (interfaces only): BlockchainPort, PricePort, StoragePort, etc.

**Application** - Use cases and orchestration
- Orchestrator: Core class handles startup/shutdown, RunLoop handles round monitoring
- Use Cases: Checkpoint, ClaimRewards, ExecutePlacement

**Infrastructure** - Adapters and DI
- Adapters: Solana blockchain, Jupiter price, Discord/Console notification
- Caches: SlotCache, BlockhashCache, InstructionCache
- DI Container: Wires dependencies based on config

### Configuration

Two files in `config/`:
- `config.json`: Runtime settings (RPC commitment, timing, strategy, transaction options)
- `.env`: Secrets (wallet keypair env var name, RPC URLs, API keys)

Zod schema validation in config package. Env vars: `WALLET_KEYPAIR` (env var name), `RPC_HTTP_ENDPOINT`, `RPC_WS_ENDPOINT`, `JUPITER_API_KEY`, optional `DISCORD_WEBHOOK_URL`.

## Key Concepts

- **Board**: 25-square game state (ORE_BOARD_SIZE constant)
- **Round**: Deployed stakes, motherlode amount, expiration
- **Miner**: User's state per square, rewards, checkpointed round
- **Checkpoint**: Sync miner to claim rewards from previous rounds
- **Placement**: Stake deployment based on EV calculation

## ORE Protocol Integration

Manual buffer decoding for account data. WebSocket subscriptions for slot/board changes. Transaction signing with authority keypair from env var referenced by `WALLET_KEYPAIR`.
