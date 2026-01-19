import { createChildLogger } from '@osb/bot/infrastructure/logging/pino-logger';
import type {
  MiningCostConfig,
  MiningCostInput,
  MiningCostResult,
  MiningCostStrategyPort,
} from './ports/mining-cost-strategy.port';

const log = createChildLogger('mining-cost-strategy');

const SUMMARY_ENDPOINT = 'https://minemoreserver-production.up.railway.app/api/ev/summary';
const FETCH_TIMEOUT_MS = 1200;

export class MiningCostStrategy implements MiningCostStrategyPort {
  private evHistory: number[] = [];
  private lastRoundId: bigint | null = null;
  private lastEvPercent: number | null = null;
  private lastRecordedRoundId: bigint | null = null;

  constructor(private readonly config: MiningCostConfig) {}

  isEnabled(): boolean {
    return this.config.enabled === true;
  }

  async evaluate(input: MiningCostInput): Promise<MiningCostResult> {
    if (!this.config.enabled) {
      return { decision: 'MINE', evPercent: null, averageEvPercent: null };
    }

    let evPercent: number | null = null;

    if (input.roundId && this.lastRoundId === input.roundId && this.lastEvPercent !== null) {
      evPercent = this.lastEvPercent;
    } else {
      evPercent = await this.fetchEvPercent();
      this.lastRoundId = input.roundId ?? null;
      this.lastEvPercent = evPercent;
    }

    if (!Number.isFinite(evPercent ?? NaN)) {
      log.warn(
        `Mining cost: EV percent unavailable; skipping round${input.roundId ? ` ${input.roundId.toString()}` : ''} (fetch error).`,
      );
      return { decision: 'SKIP', evPercent: null, averageEvPercent: null };
    }

    const shouldRecord = input.roundId ? this.lastRecordedRoundId !== input.roundId : true;
    if (shouldRecord) {
      this.recordEv(evPercent as number);
      if (input.roundId) {
        this.lastRecordedRoundId = input.roundId;
      }
    }
    const average = this.getAverageEv();
    const decision = this.mapDecision(average ?? (evPercent as number));

    log.info(
      `Mining cost decision: ${decision} (evPercent=${(evPercent as number).toFixed(2)}%, avg=${average?.toFixed(2) ?? 'n/a'}% over ${this.evHistory.length} round(s))`,
    );

    return { decision, evPercent: evPercent as number, averageEvPercent: average };
  }

  private mapDecision(evPercent: number): MiningDecision {
    const threshold = this.config.thresholdPercent;
    return evPercent >= threshold ? 'MINE' : 'SKIP';
  }

  private recordEv(evPercent: number): void {
    this.evHistory.push(evPercent);
    const max = Math.max(2, Math.min(this.config.historyRounds, 500));
    if (this.evHistory.length > max) {
      this.evHistory.splice(0, this.evHistory.length - max);
    }
  }

  private getAverageEv(): number | null {
    if (this.evHistory.length === 0) {
      return null;
    }
    const sum = this.evHistory.reduce((acc, v) => acc + v, 0);
    return sum / this.evHistory.length;
  }

  private async fetchEvPercent(): Promise<number | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const response = await fetch(SUMMARY_ENDPOINT, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        log.warn(`Mining cost: API returned ${response.status}`);
        return null;
      }

      const data = (await response.json()) as { evPercent?: unknown };
      const evPercent = typeof data?.evPercent === 'number' ? data.evPercent : Number.NaN;
      return Number.isFinite(evPercent) ? evPercent : null;
    } catch (error) {
      log.warn(`Mining cost: API fetch failed (${(error as Error).message})`);
      return null;
    }
  }
}
