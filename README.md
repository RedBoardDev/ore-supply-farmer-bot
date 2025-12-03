# ORE.supply - farmer bot

An EV-driven automation bot for the ORE protocol on Solana. It watches the 5×5 board in real time, plans placements using expected value (EV), and submits low-latency transactions while respecting safety rails, balance limits, and observability hooks.

## Highlights
- EV-first placement engine with dynamic stake sizing, exposure caps, and optional mining-cost guardrails.
- Low-latency loop: WebSocket round streaming, proactive checkpointing, cached blockhashes, and latency-aware auto-trigger windows.
- Safety and ops: dry-run mode, configurable claim thresholds, price oracle caching, instruction caching, and Discord win/loss streak notifications.

## Requirements
- Node.js 22+ and npm.
- Solana RPC endpoints with both HTTP and WebSocket access.
- Optional: Discord webhook for notifications.

## Quick Start
1. Install dependencies: `npm install`.
2. Copy templates: `cp .env.example .env` and `cp config/config.example.json config/config.json`.
3. Edit `.env` with your RPC URLs and `BOT_KEYPAIR`.
4. Tune `config/config.json` (set `strategy.price.oreTokenAddress`, exposure caps, and claim threshold).
5. Run locally: `npm start` (graceful shutdown on `Ctrl+C`).

Config is validated at startup; missing secrets will abort boot.

## Running & Operations
- **Dev/monitor**: `npm start` (tsx executes `src/index.ts`).
- **Build**: `npm run build` (emits `dist/`).
- **Lint**: `npm run lint`.
- **PM2**: `npm run pm2:start | pm2:status | pm2:logs | pm2:restart | pm2:stop | pm2:delete`.

Runtime behavior:
- Watches the board via WebSocket (`BoardWatcher`) and keeps a fresh slot cache.
- Proactively refreshes price quotes (~20 slots before the trigger) and checkpoints the miner (~10 slots before).
- Uses `RoundStreamManager` to keep round data <50ms old; falls back to HTTP fetch + `PlacementPrefetcher` when stale.
- Plans placements with `EvStrategyPlanner`, builds instructions (compute budget + deploy), reuses blockhashes via `BlockhashCache`, and parallel-sends while guarding for latency.
- Records prep/exec latency to `data/latency-history.ndjson` and uses it to size the auto-trigger window.
- Auto-claims SOL when `claim.sol.thresholdSol` is met and `dryRun` is `false`.
- Discord alerts fire only when a webhook is configured and dry-run is off (wins and every 5th loss).

## Strategy At A Glance
- EV uses win prob `1/25`, SOL payout fee factor `0.9`, motherlode bonus (`1/625`), others' stakes, current exposure, and optional ORE value from DexScreener.
- Stake sizing starts from `baseStakePercent` of the best competing stake, scales by `stakeScalingFactor` on EV edge, respects `capNormalLamports`/`capHighEvLamports`, decay per placement, and exposure/balance buffers.
- `minEvRatio` filters unprofitable squares; `scanSquareCount` limits how many squares are evaluated each round.

## Safety & Troubleshooting
- The bot logs a warning if the miner PDA is missing—submit one manual checkpoint first.
- Mining-cost guard (`strategy.miningCost.enabled`) skips rounds when the external EV feed drops below `thresholdPercent`.
- Logs go to stdout; configure telemetry `filePath` in `Logger` if you extend it. Keep runtime logs under `logs/` (gitignored).
