export interface HistoricalRound {
  readonly roundId: bigint;
  readonly deployed: readonly bigint[];
  readonly motherlode: bigint;
  readonly expiresAt: bigint;
  readonly winningTile: number;
  readonly solPriceUsd: number;
  readonly orePriceUsd: number;
  readonly totalDeployedSol: number;
  readonly timestamp: number;
  readonly isValid: boolean;
}

export function createHistoricalRound(data: {
  roundId: bigint;
  deployed: readonly bigint[];
  motherlode: bigint;
  expiresAt: bigint;
  winningTile: number;
  solPriceUsd: number;
  orePriceUsd: number;
  totalDeployedSol: number;
  timestamp: number;
}): HistoricalRound {
  if (data.deployed.length !== 25) {
    throw new Error('Historical round must have exactly 25 deployed squares');
  }

  if (data.winningTile < 0 || data.winningTile > 24) {
    throw new Error('Winning tile must be between 0 and 24');
  }

  if (data.solPriceUsd <= 0 || data.orePriceUsd <= 0) {
    throw new Error('Prices must be positive');
  }

  return {
    ...data,
    isValid: true,
  };
}

export function isRoundValid(round: HistoricalRound): boolean {
  if (!round.isValid) return false;
  if (round.deployed.length !== 25) return false;
  if (round.winningTile < 0 || round.winningTile > 24) return false;
  if (round.solPriceUsd <= 0 || round.orePriceUsd <= 0) return false;
  if (round.deployed.some((v) => v < 0n)) return false;
  return true;
}
