# Configuration Reference

Complete reference for all backtester configuration parameters.

## Configuration File Format

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

## Parameters

### baseStakePercent

**Type:** `number` (0.0 to 1.0)
**Default:** `0.015` (1.5%)
**Optimized:** ✅ Yes

**Description:**
Base stake sizing as a percentage of the largest stake on the board. This is the foundation for calculating stake amounts before scaling factors are applied.

**How it works:**
```
base_stake = max(others_stake) × baseStakePercent
base_stake = max(base_stake, minStakeLamports)
```

**Examples:**
- `0.01` (1%) - Very conservative, small stakes
- `0.015` (1.5%) - Balanced (default)
- `0.03` (3%) - Aggressive, larger stakes
- `0.05` (5%) - Very aggressive

**Impact:**
- Higher → Larger stakes, more capital deployed, higher risk/reward
- Lower → Smaller stakes, capital preservation, lower returns

**Recommendation:**
- Conservative: 0.005 - 0.01
- Moderate: 0.01 - 0.02
- Aggressive: 0.02 - 0.05

---

### minStakeLamports

**Type:** `bigint` (string in JSON)
**Default:** `"1000000"` (0.001 SOL)
**Optimized:** ❌ No (fixed at protocol minimum)

**Description:**
Minimum stake amount in lamports. This is the protocol-enforced minimum and should not be changed.

**Conversion:**
- 1 SOL = 1,000,000,000 lamports
- 0.001 SOL = 1,000,000 lamports

**Recommendation:** Always keep at `"1000000"`

---

### capNormalLamports

**Type:** `bigint` (string in JSON)
**Default:** `"500000000"` (0.5 SOL)
**Optimized:** ✅ Yes

**Description:**
Maximum stake cap for normal EV scenarios. This limits how much you can stake on a single square when the EV is in the normal range.

**Common Values:**
- `"100000000"` (0.1 SOL) - Very conservative
- `"500000000"` (0.5 SOL) - Moderate (default)
- `"1000000000"` (1.0 SOL) - Aggressive

**Impact:**
- Higher → Can make larger bets, more exposure
- Lower → Limited position sizes, capital protected

**Recommendation:**
Set to 5-10% of your total balance.

---

### capHighEvLamports

**Type:** `bigint` (string in JSON)
**Default:** `"1000000000"` (1.0 SOL)
**Optimized:** ✅ Yes

**Description:**
Maximum stake cap for high EV scenarios. When the EV is significantly above 1.0, the bot can stake up to this amount.

**Common Values:**
- `"500000000"` (0.5 SOL) - Conservative
- `"1000000000"` (1.0 SOL) - Moderate (default)
- `"2000000000"` (2.0 SOL) - Aggressive

**Relationship to capNormalLamports:**
Should always be `>= capNormalLamports`. Typical ratio: 1.5x to 3x.

**Impact:**
- Higher → Can capitalize on excellent opportunities
- Lower → Limits maximum exposure

**Recommendation:**
Set to 10-20% of your total balance.

---

### minEvRatio

**Type:** `number | null`
**Default:** `1.0`
**Optimized:** ✅ Yes

**Description:**
Minimum Expected Value ratio required to place a stake. Only placements with EV >= this threshold will be executed.

**Understanding EV:**
- EV = 1.0: Break-even (your expected return equals your stake)
- EV = 1.5: You expect 50% profit
- EV = 2.0: You expect 100% profit (double your stake)

**Common Values:**
- `0.8` - Very aggressive (will place below break-even)
- `1.0` - Break-even threshold (default)
- `1.2` - Conservative, only good opportunities
- `1.5` - Very conservative, only excellent opportunities
- `null` - No minimum (not recommended)

**Impact:**
- Higher → Fewer placements, better quality, lower exposure
- Lower → More placements, more exposure, potentially lower returns

**Recommendation:**
- High risk tolerance: 0.8 - 1.0
- Moderate: 1.0 - 1.3
- Low risk tolerance: 1.3 - 1.8

---

### maxPlacementsPerRound

**Type:** `integer` (1 to 25)
**Default:** `12`
**Optimized:** ✅ Yes

**Description:**
Maximum number of squares to place stakes on in a single round. Limits diversification.

**Common Values:**
- `1` - Single square strategy (high risk/reward)
- `5` - Limited diversification
- `12` - Balanced diversification (default)
- `25` - Maximum diversification (all squares)

**Impact:**
- Higher → More diversification, smoother returns, higher capital requirements
- Lower → Concentrated bets, higher volatility

**Win Probability:**
- 1 placement: 4% chance to win
- 5 placements: ~18.5% chance to win
- 12 placements: ~38.5% chance to win
- 25 placements: 100% chance to win (but zero profit)

**Recommendation:**
- Conservative: 3 - 6
- Moderate: 6 - 12
- Aggressive: 12 - 20

---

### maxExposureLamportsPerRound

**Type:** `bigint | null` (string in JSON)
**Default:** `null` (no limit)
**Optimized:** ❌ No

**Description:**
Maximum total exposure (sum of all stakes) allowed in a single round. If `null`, no limit is enforced beyond available balance.

**Examples:**
- `"5000000000"` (5 SOL) - Hard cap at 5 SOL per round
- `"10000000000"` (10 SOL) - Hard cap at 10 SOL per round
- `null` - No cap (default)

**Use When:**
- You want strict risk management
- Testing with limited capital
- Ensuring reserves for multiple rounds

**Recommendation:**
Leave as `null` unless you need strict position sizing.

---

### balanceBufferLamports

**Type:** `bigint` (string in JSON)
**Default:** `"100000000"` (0.1 SOL)
**Optimized:** ✅ Yes

**Description:**
Safety buffer kept in reserve. The bot will never stake this amount, ensuring you always have funds available.

**Common Values:**
- `"50000000"` (0.05 SOL) - Minimal buffer
- `"100000000"` (0.1 SOL) - Standard (default)
- `"500000000"` (0.5 SOL) - Large buffer

**Impact:**
- Higher → More funds reserved, less available for staking
- Lower → More funds available, risk of full depletion

**Recommendation:**
Set to 1-2% of your balance, or at least 0.1 SOL.

---

### scanSquareCount

**Type:** `integer` (1 to 25)
**Default:** `25`
**Optimized:** ❌ No (always 25)

**Description:**
Number of squares to evaluate for placement opportunities. Should always be 25 to consider all squares.

**Recommendation:** Always keep at `25`

---

### includeOreInEv

**Type:** `boolean`
**Default:** `true`
**Optimized:** ❌ No (always true)

**Description:**
Whether to include motherlode (ORE rewards) in EV calculations. Should always be `true` for accurate EV.

**Recommendation:** Always keep at `true`

---

### stakeScalingFactor

**Type:** `number` (0.0 to 10.0)
**Default:** `2.0`
**Optimized:** ✅ Yes

**Description:**
Multiplier for stake sizing based on EV edge. When EV is high, stakes are scaled up by this factor.

**Formula:**
```
edge = max(0, EV - 1.0)
multiplier = 1 + sqrt(edge) × stakeScalingFactor
final_stake = base_stake × multiplier
```

**Common Values:**
- `1.0` - Minimal scaling
- `2.0` - Moderate scaling (default)
- `3.0` - Aggressive scaling
- `5.0` - Very aggressive scaling

**Impact:**
- Higher → Larger bets on high EV opportunities
- Lower → More consistent stake sizing

**Recommendation:**
- Conservative: 1.0 - 1.5
- Moderate: 1.5 - 2.5
- Aggressive: 2.5 - 4.0

---

### volumeDecayPercentPerPlacement

**Type:** `number` (0.0 to 100.0)
**Default:** `0` (no decay)
**Optimized:** ✅ Yes

**Description:**
Percentage by which to reduce stake sizing for each additional placement in the same round. Prevents over-concentration.

**How it works:**
```
decay_factor = max(0.2, 1.0 - (placements - 1) × (decay / 100))
stake = base_stake × decay_factor
```

**Examples:**
- `0` - No decay (default)
- `5` - 5% reduction per placement
- `10` - 10% reduction per placement

**Effect with 10% decay:**
- 1st placement: 100% stake
- 2nd placement: 90% stake
- 3rd placement: 80% stake
- 4th placement: 70% stake
- Etc. (minimum 20%)

**Impact:**
- Higher → Smaller stakes on later placements, less total exposure
- `0` → Equal stake sizing

**Recommendation:**
- Most strategies: 0 (no decay)
- High diversification (10+ placements): 3 - 7%

## Parameter Interactions

### baseStakePercent & stakeScalingFactor

These work together to determine final stake sizes:

```
base_stake = others_stake × baseStakePercent
scaled_stake = base_stake × (1 + sqrt(EV_edge) × stakeScalingFactor)
final_stake = min(scaled_stake, capNormal or capHighEv)
```

**Example Combinations:**

| Base% | Scaling | Strategy Type |
|-------|---------|---------------|
| 0.01 | 1.5 | Very Conservative |
| 0.015 | 2.0 | Balanced (default) |
| 0.02 | 2.5 | Moderately Aggressive |
| 0.03 | 3.0 | Aggressive |
| 0.05 | 4.0 | Very Aggressive |

### minEvRatio & maxPlacementsPerRound

These control trade-off between selectivity and frequency:

| Min EV | Max Placements | Strategy |
|--------|----------------|----------|
| 1.5 | 3 | Sniper (very selective) |
| 1.2 | 6 | Selective |
| 1.0 | 12 | Balanced (default) |
| 0.9 | 18 | Opportunistic |
| 0.8 | 25 | Spray & Pray |

### Stake Caps & Budget

Your caps should scale with your budget:

| Budget | capNormal | capHighEv | Buffer |
|--------|-----------|-----------|--------|
| 5 SOL | 0.25 SOL | 0.5 SOL | 0.1 SOL |
| 10 SOL | 0.5 SOL | 1.0 SOL | 0.1 SOL |
| 20 SOL | 1.0 SOL | 2.0 SOL | 0.2 SOL |
| 50 SOL | 2.5 SOL | 5.0 SOL | 0.5 SOL |

## Strategy Archetypes

### Conservative Strategy

```json
{
  "baseStakePercent": 0.01,
  "minEvRatio": 1.3,
  "maxPlacementsPerRound": 5,
  "stakeScalingFactor": 1.5,
  "capNormalLamports": "250000000",
  "capHighEvLamports": "500000000",
  "balanceBufferLamports": "200000000",
  "volumeDecayPercentPerPlacement": 0
}
```

**Characteristics:**
- Low stakes, high selectivity
- 20-40% of rounds played
- Lower volatility
- Target ROI: 3-8%

### Balanced Strategy (Default)

```json
{
  "baseStakePercent": 0.015,
  "minEvRatio": 1.0,
  "maxPlacementsPerRound": 12,
  "stakeScalingFactor": 2.0,
  "capNormalLamports": "500000000",
  "capHighEvLamports": "1000000000",
  "balanceBufferLamports": "100000000",
  "volumeDecayPercentPerPlacement": 0
}
```

**Characteristics:**
- Moderate stakes, EV-neutral threshold
- 60-80% of rounds played
- Balanced volatility
- Target ROI: 5-15%

### Aggressive Strategy

```json
{
  "baseStakePercent": 0.03,
  "minEvRatio": 0.9,
  "maxPlacementsPerRound": 18,
  "stakeScalingFactor": 3.0,
  "capNormalLamports": "1000000000",
  "capHighEvLamports": "2000000000",
  "balanceBufferLamports": "100000000",
  "volumeDecayPercentPerPlacement": 5
}
```

**Characteristics:**
- Large stakes, accepting slightly negative EV
- 80-95% of rounds played
- High volatility
- Target ROI: 10-30% (but higher risk)

## Validation Rules

When creating a configuration, ensure:

1. **Required fields:** All 12 parameters must be present
2. **Type correctness:** Numbers as numbers, strings for bigints, booleans as booleans
3. **Value ranges:**
   - `baseStakePercent`: 0.0 - 1.0
   - `minEvRatio`: >= 0.0 or null
   - `maxPlacementsPerRound`: 1 - 25
   - `stakeScalingFactor`: 0.0 - 10.0
   - `volumeDecayPercentPerPlacement`: 0.0 - 100.0
   - All lamport values: >= 0
4. **Logical constraints:**
   - `capHighEvLamports` >= `capNormalLamports`
   - `balanceBufferLamports` < expected balance
   - `scanSquareCount` = 25
   - `includeOreInEv` = true

## Testing Your Configuration

Always test new configurations before production:

```bash
# Quick sanity check
yarn dev test -c my-config.json -n 100

# Thorough validation
yarn dev test -c my-config.json -n 1000 -v

# Compare to baseline
yarn dev test -c baseline.json -n 1000
yarn dev test -c my-config.json -n 1000
```

## Getting Help

- See [Test Mode Guide](./TEST_MODE.md) for testing configurations
- See [Optimize Mode Guide](./OPTIMIZE_MODE.md) for finding optimal parameters
- Check the [main README](../README.md) for examples

---

**Pro Tip:** Keep multiple configs for different market conditions and risk appetites. Test them regularly and switch based on performance.
