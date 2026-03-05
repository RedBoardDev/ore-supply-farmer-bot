export interface RoundData {
  roundId: string;
  timestampStart: number;
  timestampEnd?: number;
  winningSquare?: number;
  placements: RoundPlacement[];
  stakeTotalSol: number;
  rewardsSol: number;
  rewardsOre: number;
  won: boolean;
  motherlodeWon: boolean;
  roiPercent: number;
}

export interface RoundPlacement {
  square: number;
  stakeSol: number;
  evScore: number;
}
