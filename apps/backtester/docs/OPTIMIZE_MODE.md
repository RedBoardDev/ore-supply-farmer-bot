# Optimize Mode - Complete Guide

Optimize Mode uses intelligent search algorithms to automatically discover the best configuration parameters for your budget and risk tolerance.

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Basic Usage](#basic-usage)
- [Command Options](#command-options)
- [Understanding the Output](#understanding-the-output)
- [Advanced Usage](#advanced-usage)
- [Use Cases](#use-cases)
- [Tips & Best Practices](#tips--best-practices)

## Overview

Optimize Mode automates the tedious process of manually testing different configurations by:
1. Intelligently exploring the parameter space
2. Testing thousands of configurations in minutes
3. Identifying high-performing candidates
4. Refining them to find near-optimal settings
5. Presenting the best configuration found

**Key Benefits:**
- Saves hours of manual testing
- Discovers non-obvious parameter combinations
- Adapts to your specific budget constraints
- Produces production-ready configurations

## How It Works

The optimizer uses a **Hybrid Random Search + Hill Climbing** algorithm:

### Phase 1: Random Search (Exploration)

```
Generate 30-50 random configurations
  ↓
Test each on historical data
  ↓
Rank by ROI
  ↓
Select top 5 candidates
```

This phase explores the entire parameter space to find promising regions.

### Phase 2: Hill Climbing (Exploitation)

```
For each top candidate:
  ↓
Generate 8 neighbor variations
  ↓
Test neighbors
  ↓
If improvement found → adopt and repeat
  ↓
If no improvement for 3 iterations → converge
  ↓
Return best configuration
```

This phase refines the best candidates found in Phase 1.

### Parameters Optimized

The optimizer adjusts these 8 parameters:

1. **minEvRatio** - Minimum EV threshold (0.8-2.0)
2. **baseStakePercent** - Base stake sizing (0.5%-5%)
3. **stakeScalingFactor** - EV-based scaling (1.0-5.0)
4. **maxPlacementsPerRound** - Max squares (1-12)
5. **capNormalLamports** - Normal stake cap (0.1-1.0 SOL)
6. **capHighEvLamports** - High EV stake cap (0.5-2.0 SOL)
7. **balanceBufferLamports** - Safety buffer (0.05-0.5 SOL)
8. **volumeDecayPercent** - Multi-placement decay (0-10%)

**Fixed Parameters:**
- `minStakeLamports`: 1,000,000 (protocol minimum)
- `scanSquareCount`: 25 (scan all squares)
- `includeOreInEv`: true (always consider motherlode)

## Basic Usage

### Minimal Command

```bash
yarn dev optimize --budget 5
```

This optimizes for a 5 SOL budget using all available rounds.

### Recommended Command

```bash
yarn dev optimize --budget 10 -n 1000 --iterations 50 -o optimized.json
```

This:
- Optimizes for 10 SOL
- Uses 1000 rounds (faster than full dataset)
- Allows up to 50 iterations
- Saves the best config to file

## Command Options

### Required Options

#### `-b, --budget <sol>`

Initial SOL budget for optimization. This should match your production wallet balance.

**Examples:**
```bash
yarn dev optimize --budget 5       # 5 SOL budget
yarn dev optimize --budget 10      # 10 SOL budget
yarn dev optimize --budget 25      # 25 SOL budget
```

**Recommendation:** Use your actual production balance. The optimizer will find parameters suited to this specific budget.

### Optional Options

#### `--min-ev <ratio>`

Minimum EV ratio bound for optimization search space. Default: 0.8

**Example:**
```bash
yarn dev optimize --budget 5 --min-ev 1.0
```

**Use when:**
- You want a conservative strategy (higher min EV)
- You're willing to skip more rounds for better EV

#### `--max-ev <ratio>`

Maximum EV ratio bound for optimization search space. Default: 2.0

**Example:**
```bash
yarn dev optimize --budget 5 --max-ev 1.5
```

**Use when:**
- You want to limit how selective the strategy can be
- You prefer more frequent placements

#### Combined EV Bounds

Define a narrow search range:

```bash
yarn dev optimize --budget 10 --min-ev 1.1 --max-ev 1.4
```

This forces the optimizer to find configs with min EV between 1.1 and 1.4.

#### `-n, --rounds <number>`

Number of rounds to use for optimization. If omitted, uses all available rounds.

**Examples:**
```bash
yarn dev optimize --budget 5 -n 500      # Quick optimization
yarn dev optimize --budget 5 -n 1000     # Standard (recommended)
yarn dev optimize --budget 5 -n 5000     # Thorough
yarn dev optimize --budget 5             # Full dataset (slow)
```

**Recommendation:** 500-1000 rounds provides a good balance between speed and accuracy.

#### `--iterations <number>`

Maximum number of optimization iterations. Default: 100

**Examples:**
```bash
yarn dev optimize --budget 5 --iterations 30     # Quick
yarn dev optimize --budget 5 --iterations 50     # Standard
yarn dev optimize --budget 5 --iterations 100    # Thorough
```

**Note:** The optimizer may stop early if it converges before reaching max iterations.

#### `-c, --config <path>`

Base configuration file to start optimization from (feature planned).

#### `-o, --output <path>`

Save the best configuration to a JSON file.

**Example:**
```bash
yarn dev optimize --budget 5 -n 1000 -o configs/best-config.json
```

The saved file can be used directly with Test Mode or in production.

## Understanding the Output

### Phase 1: Random Search Output

```
=== PHASE 1: RANDOM SEARCH (Exploration) ===

Random Search: Generating 30 random configurations...
Evaluating on 1000 rounds...
  Evaluated 10/30 configs...
  Evaluated 20/30 configs...
Random Search complete: 30 configs evaluated
Best ROI from random search: 4442.79%

Top 5 candidates from random search:
  1. ROI: 4442.79% | Win Rate: 9.88%
  2. ROI: 3829.44% | Win Rate: 32.60%
  3. ROI: 3696.64% | Win Rate: 36.40%
  4. ROI: 3218.50% | Win Rate: 27.27%
  5. ROI: 2257.81% | Win Rate: 12.36%
```

**What this means:**
- 30 random configs were tested
- Best found has 4442% ROI
- Top 5 will be refined in Phase 2

### Phase 2: Hill Climbing Output

```
=== PHASE 2: HILL CLIMBING (Exploitation) ===

Hill Climbing from candidate 1/5...
  Initial ROI: 4442.79%
  Iteration 1: Improved to 7921.49% (+3478.70%)
  Iteration 2: Improved to 8553.10% (+631.61%)
  Iteration 3: No better neighbor found (1/3)
  Iteration 4: No better neighbor found (2/3)
  Iteration 5: No better neighbor found (3/3)
  Converged after 5 iterations
  Final ROI: 8553.10%
  New global best! ROI improved by +4110.31%
```

**What this means:**
- Started from 4442% ROI
- Found improvements in iterations 1-2
- Converged at 8553% ROI (no better neighbors)
- This became the new global best

The optimizer repeats this for the top 3-5 candidates.

### Final Report

```
╔═══════════════════════════════════════════════════════════╗
║                 OPTIMIZATION RESULTS                      ║
╚═══════════════════════════════════════════════════════════╝

Best Configuration Found:
  Min EV Ratio:              1.24
  Base Stake:                2.34%
  Stake Scaling Factor:      3.7
  Max Placements/Round:      8
  Cap Normal:                0.789 SOL
  Cap High EV:               1.456 SOL
  Balance Buffer:            0.234 SOL
  Volume Decay:              4.2%

Best Performance Metrics:
  ROI:                       8553.10%
  Win Rate:                  6.12%
  Total P&L:                 +127.35 SOL
  Sharpe Ratio:              12.45

Optimization Statistics:
  Iterations:                87
  Configurations Tested:     87
  Elapsed Time:              142.3s
  ROI Improvement:           +4110.31%
```

### Top Configurations Table

```
Top 5 Configurations:
Rank  MinEV  BaseStake%  ScaleFactor  MaxPlace  ROI%
1     1.24   2.34        3.7          8         8553.10
2     1.18   2.89        3.2          7         8112.44
3     1.31   2.01        4.1          9         7889.23
4     1.45   1.78        3.5          6         7234.56
5     1.09   3.12        2.8          10        6891.34
```

This shows alternative configs that also performed well.

## Advanced Usage

### Conservative Optimization

Find a low-risk strategy:

```bash
yarn dev optimize --budget 10 \
  --min-ev 1.3 \
  --max-ev 1.8 \
  -n 1000 \
  -o conservative-config.json
```

Higher min EV = more selective = lower risk.

### Aggressive Optimization

Find a high-frequency strategy:

```bash
yarn dev optimize --budget 20 \
  --min-ev 0.8 \
  --max-ev 1.2 \
  -n 1000 \
  -o aggressive-config.json
```

Lower min EV = more placements = higher risk/reward.

### Quick Optimization

Fast iteration for testing:

```bash
yarn dev optimize --budget 5 \
  -n 500 \
  --iterations 30
```

Completes in ~60 seconds.

### Thorough Optimization

Maximum accuracy:

```bash
yarn dev optimize --budget 15 \
  -n 5000 \
  --iterations 100 \
  -o best-config.json
```

Takes 5-10 minutes but finds better configs.

## Use Cases

### Use Case 1: First-Time Setup

**Goal:** Find optimal config for your wallet balance.

```bash
# Check your wallet balance first
# Then optimize with that amount
yarn dev optimize --budget <your-balance> -n 1000 -o my-config.json
```

**What to do next:**
1. Test the found config: `yarn dev test -c my-config.json -n 2000`
2. If satisfied, use in production
3. Monitor performance and re-optimize monthly

### Use Case 2: Market Condition Changes

**Goal:** Adapt to new market conditions.

```bash
# Optimize on recent data only
yarn dev optimize --budget 10 -n 1000 -o updated-config.json
```

Run this:
- Monthly as market evolves
- After major protocol updates
- When your balance changes significantly

### Use Case 3: Risk Tolerance Adjustment

**Goal:** Find config matching your risk preference.

**For Conservative:**
```bash
yarn dev optimize --budget 10 --min-ev 1.4 --max-ev 2.0 -o safe-config.json
```

**For Moderate:**
```bash
yarn dev optimize --budget 10 --min-ev 1.0 --max-ev 1.5 -o moderate-config.json
```

**For Aggressive:**
```bash
yarn dev optimize --budget 10 --min-ev 0.8 --max-ev 1.2 -o aggressive-config.json
```

Compare their Sharpe ratios and drawdowns in test mode.

### Use Case 4: Budget Scaling

**Goal:** Find how to adjust strategy as balance grows.

```bash
yarn dev optimize --budget 5 -o config-5sol.json
yarn dev optimize --budget 10 -o config-10sol.json
yarn dev optimize --budget 20 -o config-20sol.json
```

Analyze how optimal parameters change with budget.

## Tips & Best Practices

### 1. Match Your Production Budget

Always optimize with your actual wallet balance:

```bash
yarn dev optimize --budget <exact-production-balance>
```

The optimizer finds parameters suited to this specific amount.

### 2. Use Subsam pling for Speed

1000 rounds is usually sufficient:

```bash
yarn dev optimize --budget 10 -n 1000
```

More rounds = slower but potentially more accurate.

### 3. Validate the Results

After optimization, test the found config:

```bash
yarn dev optimize --budget 10 -n 1000 -o best.json
yarn dev test -c best.json -n 2000 -v
```

Verify the test ROI is similar to optimization ROI.

### 4. Set Realistic EV Bounds

Don't set bounds too wide or too narrow:

**Too Wide:**
```bash
--min-ev 0.5 --max-ev 3.0  # Too much search space
```

**Too Narrow:**
```bash
--min-ev 1.48 --max-ev 1.52  # Overly restrictive
```

**Good:**
```bash
--min-ev 1.0 --max-ev 1.8  # Reasonable range
```

### 5. Save Your Best Configs

Always use `-o` to save results:

```bash
yarn dev optimize --budget 10 -n 1000 -o configs/optimized-2024-01-27.json
```

Keep a history of optimized configs with dates.

### 6. Re-optimize Regularly

Market conditions change. Re-optimize:
- Monthly for active traders
- Quarterly for conservative strategies
- After protocol updates

### 7. Consider Multiple Objectives

Don't just maximize ROI. Also check:
- **Win Rate** - Should be reasonable (3-10%)
- **Sharpe Ratio** - Higher is better (>2.0 = excellent)
- **Max Drawdown** - Lower is better

### 8. Start Conservative

For your first optimization:

```bash
yarn dev optimize --budget 5 --min-ev 1.2 --max-ev 1.6 -n 500
```

Once comfortable, you can try more aggressive settings.

## Common Issues

### Issue: Optimization taking too long

**Solution:** Reduce rounds or iterations:
```bash
yarn dev optimize --budget 5 -n 500 --iterations 30
```

### Issue: Found config has zero placements in test

**Cause:** Optimizer found config that's too selective for general use.

**Solution:** Narrow EV bounds:
```bash
yarn dev optimize --budget 5 --min-ev 1.0 --max-ev 1.3
```

### Issue: Wildly inconsistent results

**Cause:** Sample size too small.

**Solution:** Increase rounds:
```bash
yarn dev optimize --budget 5 -n 2000
```

### Issue: All configs perform similarly

**Cause:** Parameter bounds too narrow.

**Solution:** Widen EV range:
```bash
yarn dev optimize --budget 5 --min-ev 0.8 --max-ev 2.0
```

## Understanding Convergence

The hill climbing algorithm converges when it can't find better neighbors for 3 consecutive iterations.

**Good Convergence:**
```
Iteration 1: Improved to 5000% (+500%)
Iteration 2: Improved to 5200% (+200%)
Iteration 3: Improved to 5250% (+50%)
Iteration 4: No improvement (1/3)
Iteration 5: No improvement (2/3)
Iteration 6: No improvement (3/3)
Converged after 6 iterations
```

**Stuck in Local Maximum:**
```
Iteration 1: Improved to 2000% (+100%)
Iteration 2: No improvement (1/3)
Iteration 3: No improvement (2/3)
Iteration 4: No improvement (3/3)
Converged after 4 iterations
```

If you suspect a local maximum, run optimization again (randomness ensures different exploration).

## Next Steps

1. **Validate Results:** Test your optimized config with [Test Mode](./TEST_MODE.md)
2. **Compare Alternatives:** Look at the top 5 configs table for other good options
3. **Production Deploy:** Use the saved JSON in your production bot
4. **Monitor & Re-optimize:** Track performance and re-optimize monthly

---

**Pro Tip:** Keep a spreadsheet of your optimization runs with date, budget, rounds used, and best ROI found. This helps track strategy evolution over time.
