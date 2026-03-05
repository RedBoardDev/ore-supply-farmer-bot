import type { SimulatedRound } from '@backtester/domain/entities/simulated-round.entity';
import type { BacktestConfig } from '@backtester/domain/value-objects/backtest-config.vo';

const LAMPORTS_PER_SOL = 1_000_000_000n;

export interface BacktestMetrics {
  readonly totalRounds: number;
  readonly roundsPlayed: number;
  readonly roundsSkipped: number;
  readonly wins: number;
  readonly losses: number;
  readonly winRate: number;
  readonly totalStakeSol: number;
  readonly totalRewardsSol: number;
  readonly totalPnlSol: number;
  readonly roi: number;
  readonly averageEvScore: number;
  readonly averageStakePerRound: number;
  readonly maxDrawdownSol: number;
  readonly sharpeRatio: number;
  readonly finalBalanceSol: number;
}

export class BacktestResult {
  private constructor(
    private readonly _config: BacktestConfig,
    private readonly _simulatedRounds: readonly SimulatedRound[],
    private readonly _metrics: BacktestMetrics,
    private readonly _initialBalanceLamports: bigint,
  ) {}

  static fromSimulation(
    config: BacktestConfig,
    rounds: readonly SimulatedRound[],
    initialBalance: bigint,
  ): BacktestResult {
    const metrics = calculateMetrics(rounds, initialBalance);
    return new BacktestResult(config, rounds, metrics, initialBalance);
  }

  get config(): BacktestConfig {
    return this._config;
  }

  get simulatedRounds(): readonly SimulatedRound[] {
    return this._simulatedRounds;
  }

  get metrics(): BacktestMetrics {
    return this._metrics;
  }

  get initialBalanceLamports(): bigint {
    return this._initialBalanceLamports;
  }

  getBestRounds(limit: number): readonly SimulatedRound[] {
    return [...this._simulatedRounds]
      .filter((r) => r.won)
      .sort((a, b) => Number(b.pnlLamports - a.pnlLamports))
      .slice(0, limit);
  }

  getWorstRounds(limit: number): readonly SimulatedRound[] {
    return [...this._simulatedRounds]
      .filter((r) => !r.won && r.totalStakeLamports > 0n)
      .sort((a, b) => Number(a.pnlLamports - b.pnlLamports))
      .slice(0, limit);
  }

  getBalanceHistory(): readonly { roundId: bigint; balance: number }[] {
    return this._simulatedRounds.map((r) => ({
      roundId: r.roundId,
      balance: Number(r.balanceAfterLamports) / Number(LAMPORTS_PER_SOL),
    }));
  }
}

function calculateMetrics(rounds: readonly SimulatedRound[], initialBalance: bigint): BacktestMetrics {
  const roundsPlayed = rounds.filter((r) => r.totalStakeLamports > 0n).length;
  const roundsSkipped = rounds.length - roundsPlayed;

  const wins = rounds.filter((r) => r.won).length;
  const losses = roundsPlayed - wins;
  const winRate = roundsPlayed > 0 ? wins / roundsPlayed : 0;

  const totalStake = rounds.reduce((sum, r) => sum + r.totalStakeLamports, 0n);
  const totalRewards = rounds.reduce((sum, r) => sum + r.rewardLamports, 0n);
  const totalPnl = totalRewards - totalStake;

  const totalStakeSol = Number(totalStake) / Number(LAMPORTS_PER_SOL);
  const totalRewardsSol = Number(totalRewards) / Number(LAMPORTS_PER_SOL);
  const totalPnlSol = Number(totalPnl) / Number(LAMPORTS_PER_SOL);

  const roi = totalStakeSol > 0 ? (totalPnlSol / totalStakeSol) * 100 : 0;

  const evScores = rounds
    .flatMap((r) => r.decisions.map((d) => d.evRatio))
    .filter((ev) => ev > 0 && Number.isFinite(ev));
  const averageEvScore = evScores.length > 0 ? evScores.reduce((sum, ev) => sum + ev, 0) / evScores.length : 0;

  const averageStakePerRound = roundsPlayed > 0 ? totalStakeSol / roundsPlayed : 0;

  const maxDrawdown = calculateMaxDrawdown(rounds, initialBalance);

  const sharpeRatio = calculateSharpeRatio(rounds);

  const lastRound = rounds.at(-1);
  const finalBalance = lastRound ? lastRound.balanceAfterLamports : initialBalance;
  const finalBalanceSol = Number(finalBalance) / Number(LAMPORTS_PER_SOL);

  return {
    totalRounds: rounds.length,
    roundsPlayed,
    roundsSkipped,
    wins,
    losses,
    winRate,
    totalStakeSol,
    totalRewardsSol,
    totalPnlSol,
    roi,
    averageEvScore,
    averageStakePerRound,
    maxDrawdownSol: maxDrawdown,
    sharpeRatio,
    finalBalanceSol,
  };
}

function calculateMaxDrawdown(rounds: readonly SimulatedRound[], initialBalance: bigint): number {
  if (rounds.length === 0) return 0;

  let peak = initialBalance;
  let maxDrawdown = 0n;

  for (const round of rounds) {
    const balance = round.balanceAfterLamports;

    if (balance > peak) {
      peak = balance;
    }

    const drawdown = peak - balance;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return Number(maxDrawdown) / Number(LAMPORTS_PER_SOL);
}

function calculateSharpeRatio(rounds: readonly SimulatedRound[]): number {
  const playedRounds = rounds.filter((r) => r.totalStakeLamports > 0n);

  if (playedRounds.length < 2) return 0;

  const returns = playedRounds.map((r) => {
    if (r.totalStakeLamports === 0n) return 0;
    return Number(r.pnlLamports) / Number(r.totalStakeLamports);
  });

  const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

  const variance = returns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 0;

  const sharpe = avgReturn / stdDev;

  const roundsPerYear = 365 * 24 * 2;
  const annualizedSharpe = sharpe * Math.sqrt(roundsPerYear);

  return annualizedSharpe;
}
