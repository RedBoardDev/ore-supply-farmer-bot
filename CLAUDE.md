# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ORE Smart Bot - A Hexagonal Architecture + DDD refactor of an ORE Protocol mining bot. The bot monitors ORE rounds on Solana, evaluates placement opportunities based on Expected Value (EV), and automatically places stakes, checkpoints, and claims rewards.

## Commands

```bash
# Build all workspaces
npm run build
npm run build:domain    # Build domain package only
npm run build:config    # Build config package only
npm run build:bot       # Build bot app only

# Test
npm run test            # Run all tests
npm run test:domain     # Run domain tests only

# Type check and lint
npm run typecheck
npm run lint

# Run the bot
npm run start           # Production start
npm run dev             # Development with watch mode (apps/bot)
```

## Architecture

### Monorepo Structure
```
new-code/
├── packages/
│   ├── domain/       # Pure business logic (DDD)
│   └── config/       # Configuration types + Zod schemas
└── apps/
    └── bot/          # Hexagonal adapters + entry point
```

### Hexagonal Architecture Layers

**Domain Layer** (`packages/domain/src/`):
- `aggregates/`: Board, Round, Miner - entity clusters with invariants
- `value-objects/`: Lamports, RoundId, Slot, OrePrice, StakeAmount - validated primitives
- `events/`: RoundStarted, RoundEnded, PlacementExecuted, CheckpointCompleted, RewardsClaimed
- `services/`: EvStrategyService, CheckpointService, LatencyService
- `ports/`: BlockchainPort, PricePort, StoragePort, NotificationPort, ClockPort

**Application Layer** (`apps/bot/src/application/ore-bot.ts`):
- `OreBot` class - orchestrates monitoring, claims, checkpoints, and placements
- Uses domain aggregates and services through dependency injection

**Adapter Layer** (`apps/bot/src/adapters/`):
- `solana-blockchain.adapter.ts`: Implements BlockchainPort for Solana
- `lite-jupiter-price.adapter.ts`: Implements PricePort via Jupiter API
- `discord-notifier.adapter.ts`, `console-notifier.adapter.ts`: NotificationPort implementations
- `transaction-builder.ts`, `transaction-sender.ts`: Transaction construction/sending

### Dependency Injection

Custom IoC container in `infrastructure/container.ts`:
```typescript
// Registration
container.register('Token', factory, { singleton: true });
container.registerInstance('Token', instance);

// Resolution
const service = container.resolve<ServiceType>('Token');
```

Modules register their dependencies:
- `registerDomainModule()`: Registers domain services
- `registerBotModule()`: Registers adapters and app-specific bindings

### Configuration

Zod schema validation in `packages/config/src/schema.ts`:
```typescript
export const configSchema = z.object({
  telemetry: telemetrySchema,
  rpc: rpcSchema,
  wallet: walletSchema,
  runtime: runtimeSchema,      // dryRun, auto slots, parallelism
  strategy: strategySchema,     // stake caps, EV ratios, exposure limits
  transaction: transactionSchema,
  claim: claimSchema,
  priceOracle: priceOracleSchema,
});
```

## Key Domain Concepts

- **Board**: Represents the current game state with 25 squares, round ID, start/end slots
- **Round**: Contains deployed stakes per square, motherlode amount, expiration slot
- **Miner**: Tracks user's checkpointed round, total rewards, current stake
- **Checkpoint**: Synchronizes miner with latest round to claim rewards
- **Placement**: Stake deployment to a specific square based on EV calculation

## ORE Protocol Integration

- RPC endpoint via Helius (config: `rpc.httpEndpoint`)
- WebSocket subscriptions for slot/board changes
- Transaction signing with authority keypair from env var (`wallet.keypairEnvVar`)
