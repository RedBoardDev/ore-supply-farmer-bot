# ORE Protocol Architecture Analysis

## 1. Round Account Structure

### Key Fields in `Round` Account

```rust
pub struct Round {
    pub id: u64,                           // Round identifier
    pub deployed: [u64; 25],              // Amount of SOL deployed on each square [0-24]
    pub slot_hash: [u8; 32],              // Hash for RNG, [0; 32] = not finalized, [255; 32] = no winners
    pub count: [u64; 25],                 // Number of miners on each square
    pub expires_at: u64,                  // Slot after which claims expire
    pub motherlode: u64,                  // ORE motherlode pool for this round
    pub rent_payer: Pubkey,              // Account that paid rent
    pub top_miner: Pubkey,               // Winner of top miner reward
    pub top_miner_reward: u64,           // ORE to distribute to top miner
    pub total_deployed: u64,             // Total SOL deployed across all squares
    pub total_vaulted: u64,              // SOL sent to vault
    pub total_winnings: u64,             // SOL available to winning square miners
}
```

### How Round Fields Change During Deploy

When a **Deploy instruction** is executed:
1. **`deployed[square_id]`** - INCREMENTED by the deployment amount
2. **`count[square_id]`** - INCREMENTED by 1 (new miner deploying to this square)
3. **`total_deployed`** - INCREMENTED by the deployment amount
4. **`cumulative` field in Miner** - Captures the SNAPSHOT of `deployed[square_id]` BEFORE this deployment

Key timing: The **Miner's `cumulative[square_id]`** is set to the current round's `deployed[square_id]` value BEFORE the miner's deployment is added. This is used later in checkpoint to determine if the miner wins the top miner reward.

### Round Lifecycle

1. **Initial State** (after Reset):
   - `id = board.round_id + 1`
   - `deployed = [0; 25]`
   - `slot_hash = [0; 32]` (not finalized)
   - `expires_at = u64::MAX` (waiting for first deploy)
   - `total_deployed = 0`

2. **First Deploy** (triggers round timing):
   - `start_slot = current_slot`
   - `end_slot = start_slot + 150` (approximately 60 seconds at 2.5 slots/sec)
   - `expires_at = end_slot + ONE_DAY_SLOTS` (86400 slots ≈ 34.5 hours)
   - All subsequent deploys add to `deployed[square_id]` and `total_deployed`

3. **After Round End** (slot >= board.end_slot + INTERMISSION_SLOTS):
   - Reset instruction can finalize the round
   - `slot_hash` is set from entropy account (random value)
   - Winners determined based on `slot_hash` RNG
   - Round expires after `ONE_DAY_SLOTS` (86400 slots)

---

## 2. Deploy Instruction Validation

### Critical Validations in `process_deploy`

```rust
// Line 32: Board must be within active round slots
assert!(clock.slot >= b.start_slot && clock.slot < b.end_slot)

// Line 35: Round ID must match board's current round
assert!(r.id == board.round_id)

// Line 32: One more critical check below (implicit in first deploy)
if board.end_slot == u64::MAX {
    // First deploy to this round - triggers round start timing
    board.start_slot = clock.slot
    board.end_slot = clock.slot + 150
}

// Line 141-144: CRITICAL - Checkpoint validation
assert!(
    miner.checkpoint_id == miner.round_id,
    "Miner has not checkpointed"
)
```

### Does Deploy Validate checkpointId vs roundId?

**YES - CRITICAL REQUIREMENT:**
- **Line 141-144** in deploy.rs: The code asserts `miner.checkpoint_id == miner.round_id`
- This means: Before deploying to a NEW round, the miner MUST have checkpointed the PREVIOUS round
- If `miner.round_id` has advanced but `checkpoint_id` hasn't, the deploy will FAIL

### What Happens When Miner Deploys to New Round?

```rust
if miner.round_id != round.id {
    // Assert miner has checkpointed prior round
    assert!(
        miner.checkpoint_id == miner.round_id,
        "Miner has not checkpointed"
    );
    
    // Reset miner for new round
    miner.deployed = [0; 25];
    miner.cumulative = round.deployed;  // Snapshot of all current stakes
    miner.round_id = round.id;
}
```

When transitioning to a new round:
1. Miner's `deployed` is reset to zero
2. Miner's `cumulative` captures the current total on each square (for RNG sampling later)
3. Miner's `round_id` is updated to the new round

---

## 3. Account Subscriptions (WebSocket)

### Can We Use accountSubscribe?

**YES - FULLY SUPPORTED by Solana's JSON-RPC API**

The Solana Web3.js library's `onAccountChange` method (which wraps `accountSubscribe`) can:
- Subscribe to **Round account** changes
- Get **real-time** updates when miners deploy
- Receive updates with context (slot, commitment level)

### Implementation in Current Code

The SmartBot currently uses **polling** for Round updates:
```typescript
// Currently: fetch on every iteration
await solanaClient.getRoundAccount(roundId)

// Could instead: subscribe once and listen
connection.onAccountChange(roundAddress, callback, commitment)
```

### WebSocket Subscription Benefits

1. **Lower Latency**: Real-time updates vs polling every N milliseconds
2. **Lower RPC Load**: Single subscription vs repeated HTTP requests
3. **Guaranteed Updates**: Won't miss rapid changes between polls
4. **Network Efficient**: Push model instead of pull

### Subscription Challenges

1. **Connection Stability**: WebSocket connections can drop (requires reconnection logic)
2. **Missed Updates**: Network hiccups could cause missed notifications
3. **Ordering**: Updates might arrive out of order (need versioning)
4. **Server-side Limits**: RPC nodes may limit subscription count

### Recommended Approach

**Hybrid Model:**
```typescript
// Primary: WebSocket subscription
roundSubscriptionId = connection.onAccountChange(roundAddress, (accountInfo) => {
    const roundData = decodeRoundAccount(accountInfo.data)
    updateRoundState(roundData)
})

// Fallback: Periodic polling if no update received in X seconds
const lastUpdateTimer = setInterval(() => {
    if (Date.now() - lastUpdateTime > 5000) {
        // No update in 5 seconds, do a poll
        getRoundAccount().then(updateRoundState)
    }
}, 2000)
```

---

## 4. Timing Constraints

### On-Chain Timing Requirements

#### Round Duration
- **Round active slots**: 150 slots (approximately 60 seconds at 2.5 slots/sec)
- **Slot computation**: `end_slot = start_slot + 150`
- **SLOTS_PER_SECOND = 2.5** (used in smart-bot for timing)

#### Claim Window
- **Expires after**: `ONE_DAY_SLOTS = 86400` slots (approximately 34.5 hours)
- Checkpoint must happen before expiration, or miner forfeits rewards

#### Round Reset Window
- **Can reset after**: `clock.slot >= board.end_slot + INTERMISSION_SLOTS`
- **INTERMISSION_SLOTS = 35** (buffer between rounds)
- Early reset blocked to ensure all miners can claim

#### Checkpoint Fee Collection
- **Executor can collect fee if**: `clock.slot >= round.expires_at - TWELVE_HOURS_SLOTS`
- After 12 hours from round expiration, anyone can checkpoint and collect the fee

### Slot-Based Validations

1. **Deploy Window Check** (line 32 in deploy.rs):
   ```rust
   assert!(clock.slot >= b.start_slot && clock.slot < b.end_slot)
   ```
   - Deploy MUST occur between round start and end slots
   - **No early deploys**: Can't deploy before round officially starts
   - **No late deploys**: Can't deploy at or after end_slot

2. **First Deploy Triggers Timing**:
   - When `board.end_slot == u64::MAX` (waiting state)
   - First deploy sets `start_slot = current_slot`, `end_slot = current_slot + 150`
   - All subsequent deploys in that round must be within the window

3. **Slot Hash Finality**:
   - `slot_hash` is populated from entropy account during Reset
   - Can only checkpoint after slot hash is set (checked in checkpoint.rs line 38)
   - Validates `slot_hash != [0; 32] && slot_hash != [255; 32]`

---

## 5. Parallel Deploys in Same Slot

### Can Multiple Deploy Instructions Hit the Same Round in Same Slot?

**YES - FULLY SUPPORTED and Expected**

The protocol is designed for parallel mining from multiple wallets:

#### Handling Parallel Deploys

1. **Atomicity per Transaction**: Each deploy instruction is atomic
   - One transaction's deploy completes before the next begins
   - No race conditions on `deployed[square_id]` or `total_deployed`

2. **Order Dependency**: Solana runtime serializes transactions
   - Transactions are ordered by leader
   - One deploy executes fully, then the next
   - Each subsequent deploy sees updated `Round.deployed` and `Round.total_deployed`

3. **Miner Isolation**: Each miner has separate account
   - Miners' `deployed[square_id]` are independent
   - `cumulative[square_id]` captures the state at their deployment time
   - Different miners deploying to same square = different cumulative values = different RNG sampling ranges

#### Example: Three Miners Deploy to Square 0 in Same Slot

```
Initial: Round.deployed[0] = 0, Round.count[0] = 0

Miner A deploys 1 SOL:
  - Miner A.cumulative[0] = 0 (current value before deploy)
  - Miner A.deployed[0] = 1
  - Round.deployed[0] += 1 → 1
  - Round.count[0] += 1 → 1
  - RNG sample range for A: [0, 1)

Miner B deploys 2 SOL:
  - Miner B.cumulative[0] = 1 (current value after A's deploy)
  - Miner B.deployed[0] = 2
  - Round.deployed[0] += 2 → 3
  - Round.count[0] += 1 → 2
  - RNG sample range for B: [1, 3)

Miner C deploys 1 SOL:
  - Miner C.cumulative[0] = 3 (current value after B's deploy)
  - Miner C.deployed[0] = 1
  - Round.deployed[0] += 1 → 4
  - Round.count[0] += 1 → 3
  - RNG sample range for C: [3, 4)

Final: Round.deployed[0] = 4, Round.count[0] = 3
```

#### RNG Sampling for Top Miner

```rust
pub fn top_miner_sample(&self, rng: u64, winning_square: usize) -> u64 {
    if self.deployed[winning_square] == 0 {
        return 0;
    }
    rng.reverse_bits() % self.deployed[winning_square]
}
```

The RNG sample is then compared against each miner's `cumulative` range:
```rust
if top_miner_sample >= miner.cumulative[winning_square]
    && top_miner_sample < miner.cumulative[winning_square] + miner.deployed[winning_square]
{
    // This miner won top miner reward
    rewards_ore = round.top_miner_reward
}
```

---

## 6. WebSocket Subscription for Round Updates

### Recommended Implementation

```typescript
class RoundAccountSubscriber {
  private subscriptionId: number | null = null;
  private lastUpdateSlot: number = 0;
  
  async subscribe(roundAddress: PublicKey, callback: (round: RoundAccount, slot: number) => void) {
    this.subscriptionId = this.connection.onAccountChange(
      roundAddress,
      (accountInfo, context) => {
        const round = decodeRoundAccount(accountInfo.data);
        this.lastUpdateSlot = context.slot;
        callback(round, context.slot);
      },
      "confirmed"  // or "processed" for lower latency
    );
  }
  
  unsubscribe() {
    if (this.subscriptionId !== null) {
      this.connection.removeAccountChangeListener(this.subscriptionId);
    }
  }
}
```

### Advantages Over Polling

| Aspect | Polling | WebSocket Subscription |
|--------|---------|------------------------|
| **Latency** | 100ms-1000ms | 10-50ms (if configured) |
| **RPC Calls** | 10-20 per second | 1 per round change |
| **Bandwidth** | Constant | Only on changes |
| **Complexity** | Simple | Requires error handling |
| **Missed Updates** | Possible | Less likely |

### Migration Path for SmartBot

1. **Phase 1**: Keep polling as primary, add subscription as optional
2. **Phase 2**: Subscription-first with polling fallback
3. **Phase 3**: Full subscription-based architecture

---

## 7. Key Takeaways

### Checkpoint Requirements
- **MUST checkpoint before deploying to next round**
- `deploy` instruction validates `miner.checkpoint_id == miner.round_id`
- Failure to checkpoint blocks all future deploys

### Round Timing
- **150 slots per round** (≈60 seconds)
- **34.5 hours** to claim rewards
- **INTERMISSION_SLOTS = 35** between rounds

### Parallel Deploys
- **Fully supported** and expected
- Each miner's `cumulative` captures state at their deploy time
- RNG sampling is deterministic based on deposit order

### WebSocket Readiness
- **Fully supported by Solana protocol**
- Can subscribe to Round account changes in real-time
- Better latency and lower RPC load than polling
- Requires robust reconnection logic

### No Validation of Deploy-to-Checkpoint Sequencing
- The protocol does NOT check `checkpointId` vs `roundId` during **this round's** deploy
- Only checks that if deploying to a **NEW** round, the previous round must be checkpointed
- So multiple deploys within same round are always allowed (no checkpoint required between them)
