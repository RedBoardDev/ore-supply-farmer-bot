# Test Mode - Complete Guide

Test Mode allows you to evaluate your bot configuration against historical ORE blockchain data to see how it would have performed.

## Table of Contents

- [Overview](#overview)
- [Basic Usage](#basic-usage)
- [Command Options](#command-options)
- [Understanding the Output](#understanding-the-output)
- [Advanced Usage](#advanced-usage)
- [Use Cases](#use-cases)
- [Tips & Best Practices](#tips--best-practices)

## Overview

Test Mode simulates your bot's behavior on real historical data:
1. Loads your configuration file
2. Fetches historical rounds from the database
3. Simulates placement decisions using your config
4. Calculates comprehensive performance metrics
5. Displays a detailed report

This allows you to answer questions like:
- "How would this config have performed last month?"
- "Is my min EV threshold too conservative?"
- "What's my expected win rate with these settings?"

## Basic Usage

### Minimal Command

```bash
yarn dev test -c config.json
```

This tests your config on all available rounds with a 10 SOL initial balance.

### Recommended Command

```bash
yarn dev test -c config.json -n 1000 -b 10 -v
```

This tests on 1,000 rounds with 10 SOL, showing verbose output including best/worst rounds.

## Command Options

### Required Options

#### `-c, --config <path>`

Path to your configuration JSON file.

**Example:**
```bash
yarn dev test -c config/my-strategy.json
yarn dev test -c /absolute/path/to/config.json
```

### Optional Options

#### `-n, --rounds <number>`

Number of rounds to test. If omitted, uses all available rounds (~41,000).

**Examples:**
```bash
yarn dev test -c config.json -n 100      # Quick test
yarn dev test -c config.json -n 1000     # Standard test
yarn dev test -c config.json             # Full dataset
```

**Recommendation:** Start with 100-500 rounds for quick feedback, then run full tests.

#### `--start-round <id>`

Start testing from a specific round ID.

**Example:**
```bash
yarn dev test -c config.json --start-round 100000
```

#### `--end-round <id>`

End testing at a specific round ID.

**Example:**
```bash
yarn dev test -c config.json --end-round 110000
```

#### Combined Range

Test a specific period:
```bash
yarn dev test -c config.json --start-round 100000 --end-round 105000
```

#### `-b, --balance <sol>`

Initial balance in SOL. Default: 10 SOL.

**Examples:**
```bash
yarn dev test -c config.json -b 5        # Start with 5 SOL
yarn dev test -c config.json -b 20       # Start with 20 SOL
```

**Recommendation:** Match your actual production wallet balance.

#### `-v, --verbose`

Show detailed per-round breakdown including top 10 best and worst rounds.

**Example:**
```bash
yarn dev test -c config.json -n 500 -v
```

#### `-o, --output <path>`

Save results to JSON file (feature planned, not yet implemented).

## Understanding the Output

### Configuration Section

Shows the key parameters of your tested configuration:

```
Configuration:
  Min EV Ratio:               1.00
  Base Stake:                 1.50%
  Stake Scaling Factor:       2.0
  Max Placements/Round:       12
  Cap Normal:                 0.50 SOL
  Cap High EV:                1.00 SOL
```

### Data Range Section

Displays how many rounds were analyzed:

```
Data Range:
  Rounds Analyzed:            1,000
  Rounds Played:              847 (84.7%)
  Rounds Skipped:             153 (15.3%)
```

**Note:** Rounds are skipped when:
- No profitable placements above min EV
- Insufficient balance
- Invalid/corrupted round data

### Performance Summary

Core financial metrics:

```
Performance Summary:
  Initial Balance:            10.00 SOL
  Final Balance:              12.45 SOL
  Total P&L:                  +2.45 SOL (+24.5%)

  Total Stake Deployed:       42.30 SOL
  Total Rewards:              44.75 SOL
  ROI:                        5.79%
```

**Key Metrics:**
- **Final Balance:** Your ending balance after all rounds
- **Total P&L:** Absolute profit/loss
- **Total Stake:** Sum of all stakes across all placements
- **ROI:** Return on Investment = (Total Rewards - Total Stake) / Total Stake

### Win/Loss Statistics

Probability and decision metrics:

```
Win/Loss Statistics:
  Wins:                       142
  Losses:                     3,105
  Win Rate:                   4.37%

  Average Stake/Round:        0.013 SOL
  Average EV Score:           1.23
```

**Win Rate:** Should be close to 4% (1/25 squares). Higher win rates often indicate:
- Lucky sample period
- Very selective strategy (high min EV)

**Average EV Score:** Higher is better, but >1.5 may indicate overly conservative strategy.

### Risk Metrics

Volatility and risk measurements:

```
Risk Metrics:
  Max Drawdown:               -1.23 SOL (-12.3%)
  Sharpe Ratio:               0.87
```

**Max Drawdown:** Largest peak-to-trough decline. Lower is better.
**Sharpe Ratio:** Risk-adjusted return. >1.0 is good, >2.0 is excellent.

### Performance Grade

Overall assessment (F to A+):

```
Performance Grade:           B+
```

**Grading Scale:**
- **A+**: ROI > 20%
- **A**: ROI 10-20%
- **B+**: ROI 5-10%
- **B**: ROI 0-5%
- **F**: ROI < 0%

### Verbose Output (-v flag)

With `-v`, you'll see top 10 best and worst rounds:

```
╔═══════════════════════════════════════════════════════════╗
║                 Top 10 Best Rounds                        ║
╚═══════════════════════════════════════════════════════════╝
Round       Stake    Reward    P&L       ROI     Squares
118204      0.15     3.42      +3.27     2,180%  [3,7,12]
118156      0.12     2.89      +2.77     2,308%  [1,5]
```

This helps identify:
- Lucky wins with high multipliers
- Which square combinations work
- Optimal stake sizing

## Advanced Usage

### Comparing Configurations

Test multiple configs and compare:

```bash
yarn dev test -c config-conservative.json -n 1000 -b 10 > results-conservative.txt
yarn dev test -c config-aggressive.json -n 1000 -b 10 > results-aggressive.txt
diff results-conservative.txt results-aggressive.txt
```

### Testing Different Time Periods

```bash
# Test on recent rounds
yarn dev test -c config.json --start-round 115000 -v

# Test on older rounds
yarn dev test -c config.json --start-round 90000 --end-round 100000
```

### Sensitivity Analysis

Test how changing one parameter affects results:

```bash
# Baseline
yarn dev test -c config-baseline.json -n 1000

# Test with different min EV
# (Edit config file, change minEvRatio: 1.0 -> 1.2)
yarn dev test -c config-higher-ev.json -n 1000

# Compare the ROI difference
```

## Use Cases

### Use Case 1: Validate Production Config

**Goal:** Verify your current production config would have been profitable.

```bash
# Test on recent 2000 rounds with your actual balance
yarn dev test -c production-config.json -n 2000 -b 15 -v
```

**What to look for:**
- Positive ROI
- Win rate ~4%
- Max drawdown acceptable
- Sharpe ratio >0.5

### Use Case 2: A/B Testing Strategy Changes

**Goal:** Compare two strategy variations.

```bash
# Test baseline
yarn dev test -c baseline.json -n 1000 -b 10

# Test variation
yarn dev test -c variation.json -n 1000 -b 10
```

**Compare:**
- ROI difference
- Risk metrics (drawdown, Sharpe)
- Win rate

### Use Case 3: Budget Planning

**Goal:** Determine appropriate starting balance.

```bash
yarn dev test -c config.json -n 500 -b 5
yarn dev test -c config.json -n 500 -b 10
yarn dev test -c config.json -n 500 -b 20
```

**Analyze:** How balance affects:
- Number of rounds played
- Total stake capacity
- Final returns

### Use Case 4: Historical Performance Review

**Goal:** See how strategy would have performed during specific period.

```bash
# September 2024 (example round IDs)
yarn dev test -c config.json --start-round 105000 --end-round 108000 -v
```

## Tips & Best Practices

### 1. Start with Small Samples

Always test on 100-500 rounds first to catch config errors quickly:

```bash
yarn dev test -c config.json -n 100
```

### 2. Match Production Conditions

Use the same initial balance you have in production:

```bash
yarn dev test -c config.json -b <your-actual-balance>
```

### 3. Check Multiple Time Periods

Don't rely on a single test. Try different round ranges:

```bash
yarn dev test -c config.json --start-round 100000 --end-round 105000
yarn dev test -c config.json --start-round 110000 --end-round 115000
```

### 4. Use Verbose Mode for Insights

The `-v` flag reveals patterns in your best wins:

```bash
yarn dev test -c config.json -n 1000 -v
```

Look for:
- Common winning squares
- Optimal stake sizes
- EV scores of wins

### 5. Focus on Risk-Adjusted Returns

Don't just chase ROI. Consider:
- **Sharpe Ratio** - Consistency of returns
- **Max Drawdown** - Worst-case scenario
- **Win Rate** - Should be ~4% for balanced strategy

### 6. Validate Edge Cases

Test with extreme settings to understand limits:

```bash
# Minimum balance
yarn dev test -c config.json -b 1

# Maximum balance
yarn dev test -c config.json -b 50
```

### 7. Document Your Tests

Keep a log of test results:

```bash
yarn dev test -c config.json -n 1000 > test-results-2024-01-27.txt
```

## Common Issues

### Issue: "Config file not found"

**Solution:** Use absolute path or verify file location:
```bash
yarn dev test -c /full/path/to/config.json
```

### Issue: "No rounds played"

**Cause:** Min EV too high or balance too low.

**Solution:**
- Lower `minEvRatio` in config
- Increase initial balance (`-b`)

### Issue: Very low ROI despite high win rate

**Cause:** Stake sizes too small relative to pot.

**Solution:**
- Increase `baseStakePercent`
- Adjust `capNormalLamports` and `capHighEvLamports`

### Issue: High ROI but terrible Sharpe ratio

**Cause:** Inconsistent returns, high volatility.

**Solution:**
- Increase `minEvRatio` for more selective placement
- Reduce `maxPlacementsPerRound`

## Next Steps

- Once you're happy with test results, try **[Optimize Mode](./OPTIMIZE_MODE.md)** to find even better configs
- See **[Config Reference](./CONFIG_REFERENCE.md)** for parameter details
- Review the main **[README](../README.md)** for examples

---

**Remember:** Past performance doesn't guarantee future results. Market conditions change over time.
