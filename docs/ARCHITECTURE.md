## 1. Summary

- **`packages/domain`** = pure code, shareable frontend (NO external dependencies: no pino, fs, fetch, @solana/web3.js)
- **`apps/bot/src/domain/`** = domain concepts LOCAL to the bot (services with logging, HTTP, fs - not shareable)
- **4 strict layers**: Pure Domain → Local Domain → Application → Infrastructure
- **Ports in domain, adapters in infrastructure** (respects Hexagonal)
- **Use cases organized**: monitor-round, execute-placement, checkpoint, claim-rewards

---

## 2. Architecture Rules (Dependency Rule)

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                    apps/bot                             │
                    │                   (monolithic)                          │
                    └─────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
        ┌───────────────────┐ ┌───────────────┐ ┌───────────────────────┐
        │   application/    │ │   domain/     │ │   infrastructure/     │
        │                   │ │   (LOCAL)     │ │                       │
        │   use-cases/      │ │               │ │   adapters/           │
        │   orchestrator/   │ │   services/   │ │   di/                 │
        │                   │ │   types/      │ │   logging/            │
        └─────────┬─────────┘ └───────┬───────┘ └───────────┬───────────┘
                  │                   │                       │
                  │                   │                       │
                  │         ┌─────────┴─────────┐           │
                  │         │                   │           │
                  │         ▼                   ▼           │
                  │ ┌─────────────────────────────────────┐ │
                  │ │        packages/domain (PUR)         │ │
                  │ │                                         │ │
                  │ │  aggregates/  value-objects/  events/  │ │
                  │ │            ports/          types/      │ │
                  │ │                                         │ │
                  │ │   NO EXTERNAL DEPENDENCIES              │ │
                  │ └─────────────────────────────────────────┘ │
                  │                                           │
                  └───────────────────────────────────────────┘
```

### Dependency Rule (NON-NEGOTIABLE)

| Layer | Can Import | CANNOT Import |
|-------|------------|---------------|
| `packages/domain/` | **nothing** (stand-alone) | `@solana/web3.js`, `pino`, `fs`, `fetch`, `zod` |
| `apps/bot/src/domain/` | `packages/domain`, `apps/bot/src/ports` | - |
| `apps/bot/src/application/` | `apps/bot/src/domain`, `apps/bot/src/ports` | - |
| `apps/bot/src/infrastructure/` | **everything** | - |

### Hexagonal Rules (Ports & Adapters)

| Type | Location | Role |
|------|----------|------|
| **Port (interface)** | `packages/domain/ports/` | Contract definition (e.g., `BlockchainPort`) |
| **Inbound Adapter** | `infrastructure/adapters/` | Port implementation (e.g., `SolanaBlockchainAdapter`) |
| **Outbound Adapter** | `infrastructure/adapters/` | Calls external services (e.g., `LiteJupiterPriceAdapter`) |
| **Infrastructure** | `infrastructure/` | Logging, DI, constants |

---

## 3. Ubiquitous Language (Business Vocabulary)

| Term | Definition |
|------|------------|
| **Board** | Game board (25 squares) with active round, start/end slots, epochId |
| **Round** | Round with 25 positions, motherlode (ORE rewards), expiration |
| **Miner** | User account: authority, stakes[], rewardsSol, checkpointId, roundId |
| **Stake** | SOL staked on a square (0-24), maximum 25 stakes per round |
| **Placement** | Action of deploying a stake on a square based on EV calculation |
| **Checkpoint** | Miner synchronization to claim rewards from the previous round |
| **Claim** | Retrieval of accumulated SOL rewards after checkpoint |
| **Motherlode** | Total ORE rewards distributed in a round |
| **EV (Expected Value)** | Ratio calculated to determine if a placement is profitable |
| **Slot** | Solana blockchain time unit (~400ms), SLOTS_PER_SECOND ≈ 2.5 |
| **RoundId** | Unique round identifier (sequential bigint) |
| **OrePrice** | ORE/SOL price with fees (9x net after 10% fee) |
| **Lamports** | SOL unit (1 SOL = 10^9 lamports) |

---

## 4. Identified Bounded Contexts

| Context | Responsibility | Dependencies |
|---------|----------------|-------------|
| **Game** | ORE cycle management: Board, Round, Miner, Placement, Checkpoint, Claim | blockchain (account reading) |
| **Strategy** | Decision calculations: EV, mining cost, latency, exposure | price-oracle, blockchain |
| **Blockchain** | Solana abstraction: account reading, tx sending, subscriptions, blockhash | @solana/web3.js |
| **Price-Oracle** | ORE price via Jupiter API | External Jupiter API |

---

## 5. Complete New Tree

```
ore-supply-farmer-bot/
│
├── # ROOT CONFIGURATION
├── CLAUDE.md
├── package.json
├── turbo.json
├── tsconfig.base.json
│
├── # ─────────────────────────────────────────────────────────────────────── #
│                                 PACKAGES                                     │
│                                  (libraries)                                 │
│ ─────────────────────────────────────────────────────────────────────────── #
│
├── packages/
│   │
│   ├── config/                                      # Shared configuration
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── schema.ts                            # Zod schemas
│   │       ├── types.ts                             # Inferred ConfigSchema types
│   │       └── index.ts                             # Exports: loadConfig, ConfigSchema
│   │
│   └── domain/                                      # PUR DOMAIN (shareable)
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           │
│           ├── # AGGREGATES (entities with invariants)
│           ├── aggregates/
│           │   ├── board.aggregate.ts               # Board (aggregate root)
│           │   │                                        roundId, startSlot, endSlot, epochId
│           │   ├── round.aggregate.ts               # Round
│           │   │                                        id, deployed[25], motherlode, expiresAt
│           │   ├── miner.aggregate.ts               # Miner
│           │   │                                        authority, deployed[25], rewardsSol, checkpointId, roundId
│           │   └── index.ts                         # Exports: Board, Round, Miner, types
│           │
│           ├── # VALUE OBJECTS (immutables, without identity)
│           ├── value-objects/
│           │   ├── lamports.vo.ts                   # 1 SOL = 10^9 lamports
│           │   ├── slot.vo.ts                       # Blockchain slot, SLOTS_PER_SECOND
│           │   ├── round-id.vo.ts                   # RoundId (bigint)
│           │   ├── ore-price.vo.ts                  # ORE/SOL price with ORE_FEES = 0.9
│           │   ├── stake-amount.vo.ts               # Stake amount
│           │   └── index.ts                         # Exports: Lamports, Slot, RoundId, OrePrice, StakeAmount
│           │
│           ├── # DOMAIN EVENTS (past business facts)
│           ├── events/
│           │   ├── round-started.event.ts           # type RoundStartedEventData
│           │   ├── round-ended.event.ts             # type RoundEndedEventData
│           │   ├── placement-executed.event.ts      # type PlacementExecutedEventData
│           │   ├── checkpoint-completed.event.ts    # type CheckpointCompletedEventData
│           │   ├── rewards-claimed.event.ts         # type RewardsClaimedEventData
│           │   └── index.ts                         # Exports: all types and factories
│           │
│           ├── # PORTS (interfaces - NO implementation)
│           ├── ports/
│           │   ├── blockchain.port.ts               # BlockchainPort (account reading, tx, subscriptions)
│           │   ├── price.port.ts                    # PricePort (getPrice, refresh, isStale)
│           │   ├── notification.port.ts             # NotificationPort (send)
│           │   ├── clock.port.ts                    # ClockPort (now, sleep)
│           │   ├── storage.port.ts                  # StoragePort (load, save)
│           │   └── index.ts                         # Exports: all interfaces
│           │
│           ├── # TYPES (shared types, no business invariants)
│           ├── types/
│           │   ├── index.ts                         # SolanaAddress, etc.
│           │   └── index.ts                         # (or directly in index.ts)
│           │
│           └── index.ts                             # Public package exports
│
│
│
│ # ─────────────────────────────────────────────────────────────────────── #
│                                  APPS                                       │
│                                (applications)                               │
│ ─────────────────────────────────────────────────────────────────────────── #
│
└── apps/
    └── bot/                                         # Bot Application
        ├── package.json
        ├── tsconfig.json
        ├── turbo.json
        │
        ├── src/
        │   │
        │   ├── # ENTRYPOINT
        │   ├── main.ts                              # CLI entry point: start/stop bot
        │   │
        │   ├── # LOCAL DOMAIN (NOT SHARED, bot-specific)
        │   ├── domain/
        │   │   ├── index.ts                         # Exports services, types
        │   │   │
        │   │   ├── # BOT DOMAIN TYPES (local business concepts)
        │   │   ├── types/
        │   │   │   ├── round-state.ts               # RoundState (placedRoundId, priceRefreshedForRound, etc.)
        │   │   │   ├── placement-decision.ts        # PlacementDecision (uses EvStrategyService)
        │   │   │   ├── latency-snapshot.ts          # LatencySnapshot (prepMs, execMs, p95)
        │   │   │   ├── latency-record.ts            # LatencyRecord (roundId, prepMs, execMs)
        │   │   │   ├── placement-result.ts          # PlacementResult (success, squareIndex, amount, signature)
        │   │   │   ├── prepared-placement.ts        # PreparedPlacement (decision, instructions)
        │   │   │   ├── budget-info.ts               # BudgetInfo (remainingSlots, remainingTimeMs)
        │   │   │   ├── round-metrics.ts             # RoundMetrics (totalStake, squares, placements)
        │   │   │   └── index.ts                     # Exports: all local domain types
        │   │   │
        │   │   └── # DOMAIN SERVICES (with dependencies: logging, HTTP, fs)
        │   │       ├── services/
        │   │       │   ├── ev-strategy.service.ts   # DefaultEvStrategyService (imports pino-logger OK)
        │   │       │   │                                calculateDecisions(), recalculateEv()
        │   │       │   ├── mining-cost-strategy.service.ts  # DefaultMiningCostStrategy (HTTP fetch OK)
        │   │       │   │                                evaluate(), isEnabled()
        │   │       │   ├── checkpoint.service.ts     # DefaultCheckpointService
        │   │       │   │                                needsCheckpoint(), ensureCheckpoint(), notifyRoundStart()
        │   │       │   ├── latency.service.ts        # DefaultLatencyService, FileLatencyStorage
        │   │       │   │                                record(), getSnapshot(), estimateSlots()
        │   │       │   ├── default-clock.ts          # DefaultClock
        │   │       │   └── index.ts                  # Exports: DefaultEvStrategyService, DefaultMiningCostStrategy, etc.
        │   │   │
        │   │       └── # PORTS (interfaces local to the bot)
        │   │           └── ports/
        │   │               ├── latency-storage.port.ts    # LatencyStoragePort
        │   │               ├── round-metrics.port.ts      # RoundMetricsPort (optional)
        │   │               └── index.ts                   # Exports
        │   │
        │   ├── # APPLICATION (use cases - orchestration)
        │   ├── application/
        │   │   ├── index.ts                         # Exports: use-cases, orchestrator
        │   │   │
        │   │   ├── # USE CASES (one per responsibility)
        │   │   ├── use-cases/
        │   │   │   ├── index.ts                     # Exports all use-cases
        │   │   │   │
        │   │   │   ├── monitor-round/
        │   │   │   │   ├── monitor-round.ts         # RoundMonitor (detects new round)
        │   │   │   │   ├── round-state.ts           # resetRoundState(), RoundState
        │   │   │   │   └── index.ts                 # Exports: RoundMonitor
        │   │   │   │
        │   │   │   ├── execute-placement/
        │   │   │   │   ├── executor/
        │   │   │   │   │   ├── placement-executor.ts    # PlacementExecutor (executes placements)
        │   │   │   │   │   ├── attempt-placement.ts     # AttemptPlacement (attempt with retry)
        │   │   │   │   │   └── index.ts                 # Exports: PlacementExecutor
        │   │   │   │   ├── evaluator/
        │   │   │   │   │   ├── placement-evaluator.ts   # PlacementEvaluator (calculates EV decisions)
        │   │   │   │   │   └── index.ts                 # Exports: PlacementEvaluator
        │   │   │   │   ├── prefetcher/
        │   │   │   │   │   ├── placement-prefetcher.ts  # PlacementPrefetcher (prepares instructions)
        │   │   │   │   │   └── index.ts                 # Exports: PlacementPrefetcher
        │   │   │   │   └── index.ts                     # Exports: PlacementExecutor, PlacementEvaluator
        │   │   │   │
        │   │   │   ├── checkpoint/
        │   │   │   │   ├── checkpoint-usecase.ts       # CheckpointUseCase (checkpoint miner)
        │   │   │   │   └── index.ts                    # Exports: CheckpointUseCase
        │   │   │   │
        │   │   │   ├── claim-rewards/
        │   │   │   │   ├── claim-usecase.ts            # ClaimUseCase (claim SOL rewards)
        │   │   │   │   └── index.ts                    # Exports: ClaimUseCase
        │   │   │   │
        │   │   │   └── notification/
        │   │   │       ├── notify.ts                   # Notification functions
        │   │   │       └── index.ts                    # Exports: notifyRoundStart, notifyRoundEnd, etc.
        │   │   │
        │   │   └── # ORCHESTRATOR (coordinates use-cases)
        │   │       ├── orchestrator/
        │   │       │   ├── ore-bot.ts                  # OreBot (main class)
        │   │       │   ├── run-loop.ts                 # RunLoop (monitoring loop)
        │   │       │   ├── board-watcher.ts            # BoardWatcher (watches board changes)
        │   │       │   └── index.ts                    # Exports: OreBot, RunLoop
        │   │       │
        │   │       └── decoders.ts                     # ORE account decoders (parseRawAccount)
        │   │
        │   ├── # INFRASTRUCTURE (adapters - implements ports)
        │   ├── infrastructure/
        │   │   ├── index.ts                         # Main adapter exports
        │   │   │
        │   │   ├── # DEPENDENCY INJECTION
        │   │   ├── di/
        │   │   │   ├── container.ts                 # Container (resolve, register, registerInstance)
        │   │   │   ├── module-registry.ts           # moduleRegistry(config) - registers all bindings
        │   │   │   └── index.ts                     # Exports: getGlobalContainer, moduleRegistry
        │   │   │
        │   │   ├── # ADAPTERS (implements ports)
        │   │   ├── adapters/
        │   │   │   ├── index.ts                     # Exports all adapters
        │   │   │   │
        │   │   │   ├── # BLOCKCHAIN
        │   │   │   ├── blockchain/
        │   │   │   │   ├── solana.adapter.ts        # SolanaBlockchainAdapter (implements BlockchainPort)
        │   │   │   │   │                                getBoard(), getRound(), getMiner()
        │   │   │   │   │                                submitTransaction(), onBoardChange(), onSlotChange()
        │   │   │   │   │                                getLatestBlockhash(), unsubscribe()
        │   │   │   │   ├── blockhash-cache.adapter.ts    # BlockhashCacheAdapter
        │   │   │   │   │                                getFreshBlockhash(), start(), stop()
        │   │   │   │   └── types.ts                      # Blockchain-specific types
        │   │   │   │
        │   │   │   ├── # PRICE ORACLE
        │   │   │   ├── price/
        │   │   │   │   └── lite-jupiter-price.adapter.ts # LiteJupiterPriceAdapter (implements PricePort)
        │   │   │   │                                            getPrice(), refresh(), isStale()
        │   │   │   │
        │   │   │   ├── # NOTIFICATION
        │   │   │   ├── notification/
        │   │   │   │   ├── discord.adapter.ts            # DiscordNotifierAdapter (implements NotificationPort)
        │   │   │   │   │                                      send() - webhook HTTP
        │   │   │   │   ├── console.adapter.ts             # ConsoleNotifierAdapter (fallback)
        │   │   │   │   ├── discord-formatter.ts           # Discord message formatter
        │   │   │   │   └── discord-client.ts              # Discord client (optional)
        │   │   │   │
        │   │   │   ├── # STORAGE
        │   │   │   ├── storage/
        │   │   │   │   └── file-latency.adapter.ts        # FileLatencyStorage (implements LatencyStoragePort)
        │   │   │   │                                            load(), enqueue(), flush()
        │   │   │   │
        │   │   │   ├── # CACHE
        │   │   │   ├── cache/
        │   │   │   │   ├── slot-cache.adapter.ts          # SlotCacheAdapter
        │   │   │   │   │                                      getSlot(), start(), stop()
        │   │   │   │   └── instruction-cache.adapter.ts    # InstructionCacheAdapter
        │   │   │   │                                            cache(), retrieve(), clear()
        │   │   │   │
        │   │   │   ├── # WATCH (subscriptions)
        │   │   │   ├── watch/
        │   │   │   │   ├── board-watcher.adapter.ts       # BoardWatcherAdapter
        │   │   │   │   │                                      start(), stop(), onBoardChange()
        │   │   │   │   └── slot-watcher.adapter.ts         # SlotWatcherAdapter (optional)
        │   │   │   │
        │   │   │   ├── # TRANSACTION
        │   │   │   ├── transaction/
        │   │   │   │   ├── builder.ts                    # TransactionBuilder
        │   │   │   │   │                                      buildDeployInstruction()
        │   │   │   │   │                                      buildCheckpointInstruction()
        │   │   │   │   │                                      buildClaimSolInstruction()
        │   │   │   │   │                                      buildTransaction()
        │   │   │   │   │                                      getEntropyVar()
        │   │   │   │   ├── sender.ts                     # TransactionSender
        │   │   │   │   │                                      send(), confirm()
        │   │   │   │   └── types.ts                      # Transaction types
        │   │   │   │
        │   │   │   └── # PREFETCH
        │   │   │       └── placement-prefetcher.adapter.ts # PlacementPrefetcherAdapter
        │   │   │                                                  prefetch(), retrieve(), clear()
        │   │   │
        │   │   ├── # LOGGING
        │   │   ├── logging/
        │   │   │   ├── pino.logger.ts                 # createPinoLogger(), PinoLogger, createChildLogger()
        │   │   │   └── types.ts                       # LogLevel, LoggerPort (if not in domain)
        │   │   │
        │   │   └── # CONSTANTS
        │   │       ├── constants.ts                   # ORE_PROGRAM_ID, BOARD_ADDRESS, ENTROPY_PROGRAM_ID
        │   │       └── index.ts                       # Exports constants
        │   │
        │   └── # CONFIG (bot config loading)
        │       └── index.ts                           # loadBotConfig(), getBotConfig()
        │
        ├── # TESTS
        ├── test/
        │   ├── unit/
        │   │   ├── domain/
        │   │   │   ├── aggregates/
        │   │   │   │   ├── board.spec.ts
        │   │   │   │   ├── round.spec.ts
        │   │   │   │   └── miner.spec.ts
        │   │   │   ├── value-objects/
        │   │   │   │   ├── lamports.spec.ts
        │   │   │   │   ├── slot.spec.ts
        │   │   │   │   └── ore-price.spec.ts
        │   │   │   └── events/
        │   │   │       └── events.spec.ts
        │   │   │
        │   │   ├── domain-services/
        │   │   │   └── ev-strategy.spec.ts
        │   │   │
        │   │   └── use-cases/
        │   │       └── placement.spec.ts
        │   │
        │   ├── integration/
        │   │   ├── adapters/
        │   │   │   ├── solana.spec.ts
        │   │   │   └── jupiter.spec.ts
        │   │   │
        │   │   └── infrastructure/
        │   │       └── di.spec.ts
        │   │
        │   └── fixtures/
        │       ├── accounts/
        │       │   ├── board.json
        │       │   ├── round.json
        │       │   └── miner.json
        │       └── responses/
        │           └── price.json
        │
        └── # DIST (build output - DO NOT version)
        ├── dist/
        │   ├── main.js
        │   ├── main.d.ts
        │   ├── application/
        │   │   ├── use-cases/
        │   │   │   └── ...
        │   │   └── orchestrator/
        │   │       └── ...
        │   ├── domain/
        │   │   ├── services/
        │   │   │   └── ...
        │   │   └── types/
        │   │       └── ...
        │   ├── infrastructure/
        │   │   ├── adapters/
        │   │   │   └── ...
        │   │   └── di/
        │   │       └── ...
        │   └── package.json
        │
        └── # GENERATED (turbo build cache)
            ├── .turbo/
            │   ├── turbo-build.log
            │   ├── turbo-lint.log
            │   ├── turbo-typecheck.log
            │   └── turbo-format$colon$check.log
```
