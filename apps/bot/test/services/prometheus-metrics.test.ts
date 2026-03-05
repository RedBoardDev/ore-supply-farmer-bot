import {
  getMetricsSnapshot,
  initializeMetrics,
  recordPlacement,
  recordRoundEnd,
  resetMetrics,
  setBotLifecycleState,
  setSessionMetrics,
} from '@osb/bot/infrastructure/metrics/prometheus';
import { beforeEach, describe, expect, it } from 'vitest';

type MetricValue = { value: number; labels: Record<string, string | number> };

type MetricSnapshot = {
  name: string;
  type: string;
  values: MetricValue[];
};

const findMetric = (metrics: MetricSnapshot[], name: string): MetricSnapshot | undefined =>
  metrics.find((metric) => metric.name === name);

const labelsMatch = (labels: Record<string, string | number>, expected: Record<string, string | number>): boolean =>
  Object.entries(expected).every(([key, value]) => labels[key] === value);

const findMetricValue = (
  metrics: MetricSnapshot[],
  name: string,
  expectedLabels: Record<string, string | number> = {},
): number | undefined => {
  const metric = findMetric(metrics, name);
  if (!metric) return undefined;
  const match = metric.values.find((value) => labelsMatch(value.labels, expectedLabels));
  return match?.value;
};

const expectFinite = (value: number | undefined): void => {
  expect(value).toBeDefined();
  expect(Number.isFinite(value as number)).toBe(true);
};

describe('prometheus metrics instrumentation', () => {
  beforeEach(() => {
    resetMetrics();
    initializeMetrics();
  });

  it('initializes bot status metrics with stable values', async () => {
    const metrics = await getMetricsSnapshot();

    const botUp = findMetricValue(metrics, 'ore_bot_up');
    expect(botUp).toBe(1);

    const stoppedStatus = findMetricValue(metrics, 'ore_bot_status', { state: 'stopped' });
    const runningStatus = findMetricValue(metrics, 'ore_bot_status', { state: 'running' });
    const pausedStatus = findMetricValue(metrics, 'ore_bot_status', { state: 'paused' });

    expect(stoppedStatus).toBe(1);
    expect(runningStatus).toBe(0);
    expect(pausedStatus).toBe(0);

    const lastChange = findMetricValue(metrics, 'ore_bot_status_last_change_timestamp_seconds');
    expectFinite(lastChange);
  });

  it('records placements without NaN values', async () => {
    recordPlacement(1n, 1, 0.5, 'success');
    recordPlacement(1n, 2, 0.7, 'failure');

    const metrics = await getMetricsSnapshot();

    const successTotal = findMetricValue(metrics, 'ore_placements_total', { status: 'success' });
    const failureTotal = findMetricValue(metrics, 'ore_placements_total', { status: 'failure' });

    expect(successTotal).toBe(1);
    expect(failureTotal).toBe(1);

    expectFinite(findMetricValue(metrics, 'ore_placement_duration_seconds_count'));
  });

  it('updates round totals and rewards on round end', async () => {
    recordRoundEnd('42', true, false, -1, 'completed', 0.5, 0.2, 1.5, 3);

    const metrics = await getMetricsSnapshot();

    expect(findMetricValue(metrics, 'ore_rounds_total')).toBe(1);
    expect(findMetricValue(metrics, 'ore_rounds_win_total')).toBe(1);
    expect(findMetricValue(metrics, 'ore_rounds_loss_total')).toBe(0);
    expect(findMetricValue(metrics, 'ore_rewards_sol_total')).toBe(0.2);
  });

  it('clamps session totals and allows negative pnl', async () => {
    setSessionMetrics({ totalStakeSol: -1, totalRewardsSol: -5, pnlSol: -2 });

    const metrics = await getMetricsSnapshot();

    expect(findMetricValue(metrics, 'ore_total_stake_sol')).toBe(0);
    expect(findMetricValue(metrics, 'ore_total_rewards_sol')).toBe(0);
    expect(findMetricValue(metrics, 'ore_pnl_sol')).toBe(-2);
  });

  it('supports lifecycle state updates without NaN', async () => {
    setBotLifecycleState('running');
    const metrics = await getMetricsSnapshot();

    const runningStatus = findMetricValue(metrics, 'ore_bot_status', { state: 'running' });
    const stoppedStatus = findMetricValue(metrics, 'ore_bot_status', { state: 'stopped' });

    expect(runningStatus).toBe(1);
    expect(stoppedStatus).toBe(0);
  });

  it('resets metrics between runs', async () => {
    recordPlacement(1n, 1, 0.5, 'success');
    resetMetrics();
    initializeMetrics();

    const metrics = await getMetricsSnapshot();
    const successTotal = findMetricValue(metrics, 'ore_placements_total', { status: 'success' });
    expect(successTotal).toBe(0);
  });
});
