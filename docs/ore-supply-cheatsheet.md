# Ore.supply & Protocol Quick Reference

Use this sheet when you need the essential mechanics of the ORE protocol without rereading the full audit. Values and behaviours are sourced from `audit.md` and live observations.

## Core Facts
- **Network**: Solana mainnet-beta.
- **Program repo**: [`regolith-labs/ore`](https://github.com/regolith-labs/ore) (Anchor-based).
- **Round cadence**: Every 60 s (new board, new round ID).
- **Board layout**: 5×5 grid (25 squares). Multiple wallets can occupy the same square, splitting payouts proportionally.
- **Currency**:
  - **Stake**: SOL (deployed per square).
  - **Reward**: 1 ORE per round (≈21 M total supply, mined 1 ORE/minute) + SOL redistributed from losing squares.
- **Mining algorithm**: DrillX (memory-hard PoW, handled on-chain).

## Instruction Overview (abridged)
- `Automate` – Stage automation config (amount, mask, fee).
- `Deploy` – Commit SOL to selected squares for the current round.
- `Checkpoint` – Finalise rewards from the previous round for a miner.
- `ClaimSol` – Withdraw accumulated SOL winnings.
- `ClaimOre` / `ClaimYield` – Withdraw ORE rewards or staking yield (not automated in the copy bot).
- `Deposit` / `Withdraw` – Manage staking balances (increases reward multiplier).
- Administrative instructions (e.g., `SetAdmin`) are not used by bots.

See `audit.md` for the full catalogue including staking, seekers, and treasury management.

## Key Accounts
- **Board Account** (`board` PDA): Tracks current round ID, start slot, end slot.
- **Round Account** (`round` PDA): Stores deployed lamports and counts per square, total pot, motherlode, slot hash.
- **Miner Account** (`miner` PDA per authority): Records deployed lamports, unclaimed SOL/ORE, checkpoint status, automation config.
- **Treasury Account**: Holds protocol balances and motherlode funds.
- **Stake Account**: Exists when a wallet stakes ORE to gain multipliers.

## Round Lifecycle
1. **Reset** (implicit, triggered by program): closes previous round, picks winners, computes rewards.
2. **Checkpoint**: Each miner must checkpoint the finished round to make rewards withdrawable. Copy bot auto-checkpoints before mirroring new deployments.
3. **Deploy window**: Until the board’s `endSlot`, miners deploy SOL. Late deployments (last few seconds) are common for sniping strategies.
4. **Distribution**: At reset, SOL from losing squares is split among winners of the randomly chosen square; 1 ORE is issued to the round winner(s).

## ore.supply Frontend Tips
- Displays the live board grid, pot size, motherlode, round number, and per-square SOL totals.
- Use it to verify that mirrored deployments match expectations when testing in production.
- Remember: the frontend lags slightly compared to RPC polling; do not rely on it for decision making in bots.

## Practical Considerations for Bots
- **Checkpoint gating**: If a miner fails to checkpoint a round, subsequent deployments on that account panic (`Miner has not checkpointed`). Always checkpoint first.
- **Automation masks**: The automation instruction requires a bitmask of targeted squares; ensure it matches the deploy instruction to avoid “invalid seeds”.
- **Window timing**: Transactions must land before the board’s `endSlot`. Allow buffer for RPC latency (copy bot enforces ~150 ms minimum).
- **RPC quotas**: High-frequency polling or mass deployments can exhaust rate limits; keep websocket pipelines healthy and avoid unnecessary HTTP fallbacks.
- **Staking multipliers**: Tracked wallets with high stake may influence expected value; adapt copy ratio accordingly.

## Useful Metrics
- **Pot size** (`round.totalDeployed`): Total SOL at stake in the round.
- **Board totals** (`round.deployed[i]`): SOL per square, used to gauge competition.
- **Motherlode**: Extra reward pot that triggers occasionally; copy bots may choose different ratios when it is high (see `analysis/bot-reverse-engineering.md`).
- **Reward deltas**: Monitor `miner.rewardsSol` and `miner.rewardsOre` to compute win/loss rounds (used in Discord notifier).

Keep this reference handy when updating strategies or explaining protocol decisions in code reviews. Update it whenever protocol parameters or observed behaviours change.***
