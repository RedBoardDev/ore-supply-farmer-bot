# ORE Backtester CLI

Backtesting and optimization CLI for ORE strategy configurations using historical data from `rounds.db`.

This README is intentionally factual: it documents what is currently implemented, what was verified by command execution, and known gaps.

## Scope

Implemented commands:
- `test`: evaluate one config on historical rounds.
- `optimize`: search a better config (random search + hill climbing).

## Reality Check (verified)

The following commands were executed successfully on local data:

```bash
node --import tsx apps/backtester/src/main.ts --help
node --import tsx apps/backtester/src/main.ts test --help
node --import tsx apps/backtester/src/main.ts optimize --help
node --import tsx apps/backtester/src/main.ts test -c apps/backtester/test-config.json -n 30 -b 10 -v --log-level info
node --import tsx apps/backtester/src/main.ts optimize --budget 5 -n 10 --iterations 1 -c apps/backtester/test-config.json --log-level info
```

Observed dataset info on the tested environment:
- valid rounds: `40951`
- range: `75408` -> `118204`

## Prerequisites

- Node.js `22+`
- Yarn dependencies installed at repo root
- SQLite database file `rounds.db` available:
  - first lookup: `<repo>/rounds.db`
  - fallback lookup: `<repo>/../../rounds.db`

## Run

From repository root:

```bash
# CLI help
node --import tsx apps/backtester/src/main.ts --help
```

You can also use package scripts from `apps/backtester`:

```bash
cd apps/backtester
yarn dev --help
```

Note: in restricted sandbox environments, `yarn dev` can fail because of TSX IPC permissions; `node --import tsx ...` is the most robust execution path.

## Command: `test`

Evaluate one configuration against historical rounds.

```bash
node --import tsx apps/backtester/src/main.ts test -c apps/backtester/test-config.json -n 500 -b 10
```

### Parameters

- `-c, --config <path>` (required)
  - JSON config path.
- `-n, --rounds <number>` (optional)
  - Positive integer.
- `--start-round <id>` (optional)
  - BigInt-compatible round id.
- `--end-round <id>` (optional)
  - BigInt-compatible round id.
- `-b, --balance <sol>` (optional, default `10`)
  - Positive number (initial balance in SOL).
- `-o, --output <path>` (optional)
  - Declared but not implemented for JSON export.
- `-v, --verbose` (optional)
  - Enables top best/worst rounds table output.
- `-l, --log-level <level>` (optional, default `warn`)
  - Available levels: `debug`, `info`, `warn`, `error`, `silent`.
  - Controls runtime logs (dataset load / simulation progress), not the final result report.

### Output

Printed report includes:
- rounds analyzed / played / skipped
- initial/final balance, PnL, ROI
- wins/losses/win rate
- average stake, average EV
- max drawdown, sharpe
- grade

## Command: `optimize`

Searches for a better parameter set on historical rounds.

```bash
node --import tsx apps/backtester/src/main.ts optimize --budget 10 -n 1000 --iterations 50
```

### Parameters

- `-b, --budget <sol>` (required)
  - Positive number (initial SOL budget).
- `--min-ev <ratio>` (optional, default `0.8`)
  - Non-negative number.
- `--max-ev <ratio>` (optional, default `2.0`)
  - Non-negative number.
- `-n, --rounds <number>` (optional)
  - Positive integer.
- `--iterations <number>` (optional, default `100`)
  - Integer `1..10000`.
- `-c, --config <path>` (optional)
  - Currently ignored with message: `feature not yet implemented, using defaults`.
- `-o, --output <path>` (optional)
  - Attempts to save best config JSON.
- `-l, --log-level <level>` (optional, default `warn`)
  - Available levels: `debug`, `info`, `warn`, `error`, `silent`.
  - Controls runtime logs (optimization/search progress), not the final result report.

### Optimization flow (implemented)

1. Random search phase.
2. Hill-climbing refinement from top candidates.
3. Final report with best config + metrics + ranking table.

## Known Limitations (current)

- `test --output`: export not implemented (`JSON report export not yet implemented`).
- `optimize --config`: base config loading not implemented (defaults used).
- Simulation uses finalized per-round board totals from historical data.
  - This can still introduce hindsight bias versus true live conditions.

## Config Schema (test command)

Expected fields:

```json
{
  "baseStakePercent": 0.015,
  "minStakeLamports": "1000000",
  "capNormalLamports": "500000000",
  "capHighEvLamports": "1000000000",
  "minEvRatio": 1.0,
  "maxPlacementsPerRound": 12,
  "maxExposureLamportsPerRound": null,
  "balanceBufferLamports": "100000000",
  "scanSquareCount": 25,
  "includeOreInEv": true,
  "stakeScalingFactor": 2.0,
  "volumeDecayPercentPerPlacement": 0
}
```

Reference files:
- [test-config.json](./test-config.json)
- [CONFIG_REFERENCE.md](./docs/CONFIG_REFERENCE.md)
- [TEST_MODE.md](./docs/TEST_MODE.md)
- [OPTIMIZE_MODE.md](./docs/OPTIMIZE_MODE.md)

## Troubleshooting

- `Config file not found`
  - Check `-c` path and run from repo root.
- `Database not found`
  - Ensure `rounds.db` exists in root or expected fallback path.

## Roadmap (recommended next fixes)

- Implement `test --output` JSON export.
- Implement actual `optimize --config` bootstrap.
- Add time-window modeling (partial board state snapshots) to reduce hindsight bias.
- Add dedicated backtester test suite (`apps/backtester/test`) and CI command.
