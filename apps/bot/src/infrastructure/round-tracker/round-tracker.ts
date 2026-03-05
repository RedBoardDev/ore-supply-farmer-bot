import type { RoundData } from './round.model';
import type { RoundStoragePort } from './round-storage.interface';

export class RoundTracker {
  constructor(private storage: RoundStoragePort) {}

  async startRound(roundId: string): Promise<void> {
    const round: RoundData = {
      roundId,
      timestampStart: Date.now(),
      placements: [],
      stakeTotalSol: 0,
      rewardsSol: 0,
      rewardsOre: 0,
      won: false,
      motherlodeWon: false,
      roiPercent: 0,
    };
    await this.storage.saveRound(round);
  }

  async addPlacement(roundId: string, square: number, stakeSol: number, evScore: number): Promise<void> {
    const round = await this.storage.getRound(roundId);
    if (!round) throw new Error(`Round ${roundId} not found`);

    round.placements.push({ square, stakeSol, evScore });
    round.stakeTotalSol += stakeSol;

    await this.storage.updateRound(roundId, round);
  }

  async endRound(roundId: string, winningSquare: number, rewardsSol: number, rewardsOre: number): Promise<void> {
    const round = await this.storage.getRound(roundId);
    if (!round) throw new Error(`Round ${roundId} not found`);

    const won = round.placements.some((p) => p.square === winningSquare);
    const motherlodeWon = winningSquare === 25 && won;

    round.timestampEnd = Date.now();
    round.winningSquare = winningSquare;
    round.rewardsSol = rewardsSol;
    round.rewardsOre = rewardsOre;
    round.won = won;
    round.motherlodeWon = motherlodeWon;

    const roiPercent = round.stakeTotalSol > 0 ? ((rewardsSol - round.stakeTotalSol) / round.stakeTotalSol) * 100 : 0;
    round.roiPercent = roiPercent;

    await this.storage.saveRound(round);
  }

  async getRound(roundId: string): Promise<RoundData | null> {
    return this.storage.getRound(roundId);
  }

  async getRounds(limit?: number): Promise<RoundData[]> {
    return this.storage.getRounds(limit);
  }
}
