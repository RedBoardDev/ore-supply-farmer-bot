import client from 'prom-client';
import type { BotLifecycleState } from '../../application/orchestrator/core';

const registry = new client.Registry();

registry.setDefaultLabels({
  app: 'ore-bot',
  version: '1.0.0',
});

client.collectDefaultMetrics({ register: registry });

const BOT_STATES = ['running', 'paused', 'stopped'] as const;

type BotState = (typeof BOT_STATES)[number];

type SessionMetricsSnapshot = {
  totalStakeSol: number;
  totalRewardsSol: number;
  pnlSol: number;
};

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

const toFiniteNumber = (value: number, fallback = 0): number => (Number.isFinite(value) ? value : fallback);

const toNonNegativeNumber = (value: number): number => (Number.isFinite(value) && value >= 0 ? value : 0);

let lastBotState: BotState | null = null;

// =============
// BUSINESS METRICS
// =============

export type PlacementStatus = 'success' | 'failure';
export type CheckpointStatus = 'success' | 'failure';
export type RpcStatus = 'success' | 'error';

// Bot status metrics
export const botUp = new client.Gauge({
  name: 'ore_bot_up',
  help: 'Bot process up (1) or down (0)',
  registers: [registry],
});

export const botStatus = new client.Gauge({
  name: 'ore_bot_status',
  help: 'Bot lifecycle status (1 for current state)',
  labelNames: ['state'] as const,
  registers: [registry],
});

export const botStatusLastChange = new client.Gauge({
  name: 'ore_bot_status_last_change_timestamp_seconds',
  help: 'Unix timestamp of last bot status change',
  registers: [registry],
});

export const uptimeSeconds = new client.Gauge({
  name: 'ore_uptime_seconds',
  help: 'Process uptime in seconds',
  registers: [registry],
  collect() {
    this.set(process.uptime());
  },
});

// Placement metrics
export const placementsTotal = new client.Counter({
  name: 'ore_placements_total',
  help: 'Total number of placement attempts',
  labelNames: ['status'] as const,
  registers: [registry],
});

export const placementDuration = new client.Histogram({
  name: 'ore_placement_duration_seconds',
  help: 'Time taken to process placement',
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 30, 45, 60],
  registers: [registry],
});

// Rewards metrics
export const rewardsSolTotal = new client.Counter({
  name: 'ore_rewards_sol_total',
  help: 'Total SOL rewards earned from rounds',
  registers: [registry],
});

export const rewardsOreTotal = new client.Counter({
  name: 'ore_rewards_ore_total',
  help: 'Total ORE rewards earned from rounds',
  registers: [registry],
});

export const rewardsClaimedSolTotal = new client.Counter({
  name: 'ore_rewards_claimed_sol_total',
  help: 'Total SOL rewards claimed',
  registers: [registry],
});

// Session totals / PnL
export const totalStakeSol = new client.Gauge({
  name: 'ore_total_stake_sol',
  help: 'Total stake in SOL for current session',
  registers: [registry],
});

export const totalRewardsSol = new client.Gauge({
  name: 'ore_total_rewards_sol',
  help: 'Total rewards in SOL for current session',
  registers: [registry],
});

export const pnlSol = new client.Gauge({
  name: 'ore_pnl_sol',
  help: 'Net realized PnL in SOL (rewards - stake)',
  registers: [registry],
});

// EV metrics (optional)
export const evScore = new client.Histogram({
  name: 'ore_ev_score',
  help: 'Expected Value scores for placements',
  buckets: [0.5, 0.8, 1.0, 1.2, 1.5, 2.0, 3.0, 5.0],
  registers: [registry],
});

// =============
// TECHNICAL METRICS
// =============

// Checkpoint metrics
export const checkpointTotal = new client.Counter({
  name: 'ore_checkpoint_total',
  help: 'Total checkpoint attempts',
  labelNames: ['status'] as const,
  registers: [registry],
});

export const checkpointDuration = new client.Histogram({
  name: 'ore_checkpoint_duration_seconds',
  help: 'Time taken to process checkpoint',
  buckets: [0.5, 1, 2, 5, 10, 20, 30, 45, 60, 90],
  registers: [registry],
});

// RPC metrics
export const rpcRequestsTotal = new client.Counter({
  name: 'ore_rpc_requests_total',
  help: 'Total number of RPC requests',
  labelNames: ['endpoint', 'method', 'status'] as const,
  registers: [registry],
});

export const rpcRequestDuration = new client.Histogram({
  name: 'ore_rpc_request_duration_seconds',
  help: 'RPC request duration',
  labelNames: ['endpoint', 'method'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

// Round metrics
export const roundActive = new client.Gauge({
  name: 'ore_rounds_active',
  help: 'Number of active rounds being monitored',
  registers: [registry],
});

export const roundCurrent = new client.Gauge({
  name: 'ore_round_current',
  help: 'Current round id being tracked',
  registers: [registry],
});

export const roundStartTimestamp = new client.Gauge({
  name: 'ore_round_start_timestamp_seconds',
  help: 'Unix timestamp when current round started',
  registers: [registry],
});

export const roundLastOutcomeTimestamp = new client.Gauge({
  name: 'ore_round_last_outcome_timestamp_seconds',
  help: 'Unix timestamp when last round outcome was recorded',
  registers: [registry],
});

export const roundLastOutcomeRoundId = new client.Gauge({
  name: 'ore_round_last_outcome_round_id',
  help: 'Round id for last evaluated round',
  registers: [registry],
});

export const roundLastOutcomeWon = new client.Gauge({
  name: 'ore_round_last_outcome_won',
  help: 'Whether last evaluated round was won (1) or lost (0)',
  registers: [registry],
});

export const roundLastPlacements = new client.Gauge({
  name: 'ore_round_last_placements',
  help: 'Placements count for last evaluated round',
  registers: [registry],
});

export const roundLastStakeSol = new client.Gauge({
  name: 'ore_round_last_stake_sol',
  help: 'Total stake (SOL) for last evaluated round',
  registers: [registry],
});

export const roundLastRewardsSol = new client.Gauge({
  name: 'ore_round_last_rewards_sol',
  help: 'Rewards (SOL) for last evaluated round',
  registers: [registry],
});

export const roundLastRewardsOre = new client.Gauge({
  name: 'ore_round_last_rewards_ore',
  help: 'Rewards (ORE) for last evaluated round',
  registers: [registry],
});

export const roundsTotal = new client.Counter({
  name: 'ore_rounds_total',
  help: 'Total number of evaluated rounds',
  registers: [registry],
});

export const roundsWinTotal = new client.Counter({
  name: 'ore_rounds_win_total',
  help: 'Total number of winning rounds',
  registers: [registry],
});

export const roundsLossTotal = new client.Counter({
  name: 'ore_rounds_loss_total',
  help: 'Total number of losing rounds',
  registers: [registry],
});

// Error metrics
export const errorsTotal = new client.Counter({
  name: 'ore_errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'severity'] as const,
  registers: [registry],
});

// WebSocket metrics
export const wsConnectionsActive = new client.Gauge({
  name: 'ore_ws_connections_active',
  help: 'Number of active WebSocket connections',
  registers: [registry],
});

export const wsReconnectionsTotal = new client.Counter({
  name: 'ore_ws_reconnections_total',
  help: 'Total number of WebSocket reconnection attempts',
  labelNames: ['reason'] as const,
  registers: [registry],
});

export const wsErrorsTotal = new client.Counter({
  name: 'ore_ws_errors_total',
  help: 'Total number of WebSocket errors',
  labelNames: ['type'] as const,
  registers: [registry],
});

export const wsLatencyMs = new client.Histogram({
  name: 'ore_ws_latency_ms',
  help: 'WebSocket message round-trip latency in milliseconds',
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2500],
  registers: [registry],
});

// Slot metrics
export const slotCurrent = new client.Gauge({
  name: 'ore_slot_current',
  help: 'Current slot number being processed',
  registers: [registry],
});

export const slotLagCluster = new client.Gauge({
  name: 'ore_slot_lag_cluster',
  help: 'Lag behind Solana cluster slot',
  registers: [registry],
});

// =============
// HELPERS
// =============

export function initializeMetrics(): void {
  botUp.set(1);
  for (const state of BOT_STATES) {
    botStatus.labels(state).set(0);
  }
  setBotLifecycleState('stopped');
  placementsTotal.labels('success').inc(0);
  placementsTotal.labels('failure').inc(0);
  checkpointTotal.labels('success').inc(0);
  checkpointTotal.labels('failure').inc(0);
  roundsTotal.inc(0);
  roundsWinTotal.inc(0);
  roundsLossTotal.inc(0);
  rewardsSolTotal.inc(0);
  rewardsOreTotal.inc(0);
  rewardsClaimedSolTotal.inc(0);
  totalStakeSol.set(0);
  totalRewardsSol.set(0);
  pnlSol.set(0);
  roundActive.set(0);
}

export function setBotUp(up: boolean): void {
  botUp.set(up ? 1 : 0);
}

export function setBotLifecycleState(state: BotLifecycleState): void {
  if (lastBotState !== state) {
    lastBotState = state;
    botStatusLastChange.set(nowSeconds());
  }
  for (const labelState of BOT_STATES) {
    botStatus.labels(labelState).set(labelState === state ? 1 : 0);
  }
}

export function setSessionMetrics(snapshot: SessionMetricsSnapshot): void {
  totalStakeSol.set(toNonNegativeNumber(snapshot.totalStakeSol));
  totalRewardsSol.set(toNonNegativeNumber(snapshot.totalRewardsSol));
  pnlSol.set(toFiniteNumber(snapshot.pnlSol));
}

/**
 * Record a placement attempt
 */
export function recordPlacement(_round: bigint, _square: number, durationSeconds: number, status: PlacementStatus) {
  placementsTotal.labels(status).inc();
  placementDuration.observe(toNonNegativeNumber(durationSeconds));
}

/**
 * Record a checkpoint
 */
export function recordCheckpoint(durationSeconds: number, status: CheckpointStatus) {
  checkpointTotal.labels(status).inc();
  checkpointDuration.observe(toNonNegativeNumber(durationSeconds));
}

/**
 * Record a reward claim
 */
export function recordRewardsClaimed(solAmount: number, _oreAmount: number) {
  rewardsClaimedSolTotal.inc(toNonNegativeNumber(solAmount));
}

/**
 * Record EV score
 */
export function recordEvScore(_round: bigint, score: number) {
  evScore.observe(toNonNegativeNumber(score));
}

/**
 * Record RPC request
 */
export function recordRpcRequest(endpoint: string, method: string, status: RpcStatus, duration: number) {
  rpcRequestsTotal.labels(endpoint, method, status).inc();
  rpcRequestDuration.labels(endpoint, method).observe(toNonNegativeNumber(duration));
}

/**
 * Record an error
 */
export function recordError(type: string, severity: 'warning' | 'error') {
  errorsTotal.labels(type, severity).inc();
}

// =============
// WS & SLOT HELPERS
// =============

/**
 * Set active WebSocket connections count
 */
export function setWsConnections(count: number) {
  wsConnectionsActive.set(toNonNegativeNumber(count));
}

/**
 * Record a WebSocket reconnection attempt
 */
export function recordWsReconnection(reason: string) {
  wsReconnectionsTotal.labels(reason).inc();
}

/**
 * Record a WebSocket error
 */
export function recordWsError(type: string) {
  wsErrorsTotal.labels(type).inc();
}

/**
 * Record WebSocket message latency
 */
export function recordWsLatency(latencyMs: number) {
  wsLatencyMs.observe(toNonNegativeNumber(latencyMs));
}

/**
 * Update current slot number
 */
export function updateSlotCurrent(slot: number) {
  slotCurrent.set(toFiniteNumber(slot));
}

/**
 * Update slot lag behind cluster
 */
export function updateSlotLag(lag: number) {
  slotLagCluster.set(toNonNegativeNumber(lag));
}

/**
 * Update active rounds count
 */
export function updateActiveRounds(count: number) {
  roundActive.set(toNonNegativeNumber(count));
}

/**
 * Record round start
 */
export function recordRoundStart(roundId: string, timestamp: number) {
  roundCurrent.set(toFiniteNumber(Number(roundId)));
  roundStartTimestamp.set(Math.floor(timestamp / 1000));
}

/**
 * Record a placement count for the last executed round
 */
export function recordRoundPlacement(_roundId: string, count: number) {
  roundLastPlacements.set(toNonNegativeNumber(count));
}

/**
 * Record round stake
 */
export function recordRoundStake(_roundId: string, stakeSol: number) {
  roundLastStakeSol.set(toNonNegativeNumber(stakeSol));
}

/**
 * Record round end with results
 */
export function recordRoundEnd(
  roundId: string,
  won: boolean,
  motherlodeWon: boolean,
  winningSquare: number,
  status: 'completed',
  stakeSol: number,
  rewardsSol: number,
  rewardsOre: number,
  placementsCount: number,
  evaluatedAtMs: number = Date.now(),
) {
  const safeStakeSol = toNonNegativeNumber(stakeSol);
  const safeRewardsSol = toNonNegativeNumber(rewardsSol);
  const safeRewardsOre = toNonNegativeNumber(rewardsOre);
  const safePlacements = toNonNegativeNumber(placementsCount);

  roundsTotal.inc();
  if (won) {
    roundsWinTotal.inc();
  } else {
    roundsLossTotal.inc();
  }

  rewardsSolTotal.inc(safeRewardsSol);
  rewardsOreTotal.inc(safeRewardsOre);

  roundLastPlacements.set(safePlacements);
  roundLastStakeSol.set(safeStakeSol);
  roundLastRewardsSol.set(safeRewardsSol);
  roundLastRewardsOre.set(safeRewardsOre);
  roundLastOutcomeWon.set(won ? 1 : 0);
  roundLastOutcomeRoundId.set(toFiniteNumber(Number(roundId)));
  roundLastOutcomeTimestamp.set(Math.floor(evaluatedAtMs / 1000));

  void motherlodeWon;
  void winningSquare;
  void status;
}

/**
 * Get all metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
  return await registry.metrics();
}
