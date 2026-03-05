const LAMPORTS_PER_SOL = 1_000_000_000n;
const SOL_PAYOUT_NUMERATOR = 9n;
const SOL_PAYOUT_DENOMINATOR = 10n;

export interface SimulatedPlacement {
  readonly squareIndex: number;
  readonly amountLamports: bigint;
  readonly evRatio: number;
}

export interface SimulatedRound {
  readonly roundId: bigint;
  readonly decisions: readonly SimulatedPlacement[];
  readonly winningTile: number;
  readonly won: boolean;
  readonly totalStakeLamports: bigint;
  readonly rewardLamports: bigint;
  readonly pnlLamports: bigint;
  readonly balanceAfterLamports: bigint;
}

export function createSimulatedRound(params: {
  roundId: bigint;
  decisions: readonly SimulatedPlacement[];
  winningTile: number;
  balanceBeforeLamports: bigint;
  totalPotLamports: bigint;
  winningSquarePotLamports: bigint;
}): SimulatedRound {
  const { roundId, decisions, winningTile, balanceBeforeLamports, totalPotLamports, winningSquarePotLamports } = params;

  const totalStake = decisions.reduce((sum, d) => sum + d.amountLamports, 0n);

  const wonPlacement = decisions.find((d) => d.squareIndex === winningTile);
  const won = wonPlacement !== undefined;

  let reward = 0n;
  if (won && wonPlacement) {
    const winnerStake = wonPlacement.amountLamports;
    const totalPotWithOurStakes = totalPotLamports + totalStake;
    const netPayoutPool = (totalPotWithOurStakes * SOL_PAYOUT_NUMERATOR) / SOL_PAYOUT_DENOMINATOR;
    const winningSquareTotal = winningSquarePotLamports + winnerStake;

    if (winningSquareTotal > 0n) {
      reward = (netPayoutPool * winnerStake) / winningSquareTotal;
    }
  }

  const pnl = reward - totalStake;
  const balanceAfter = balanceBeforeLamports - totalStake + reward;

  if (balanceAfter < 0n) {
    throw new Error('Simulated balance cannot be negative');
  }

  return {
    roundId,
    decisions,
    winningTile,
    won,
    totalStakeLamports: totalStake,
    rewardLamports: reward,
    pnlLamports: pnl,
    balanceAfterLamports: balanceAfter,
  };
}

export function calculateRoundROI(round: SimulatedRound): number {
  if (round.totalStakeLamports === 0n) return 0;

  const roi = (Number(round.pnlLamports) / Number(round.totalStakeLamports)) * 100;
  return roi;
}

export function toSol(lamports: bigint): number {
  return Number(lamports) / Number(LAMPORTS_PER_SOL);
}

export function toLamports(sol: number): bigint {
  return BigInt(Math.floor(sol * Number(LAMPORTS_PER_SOL)));
}
