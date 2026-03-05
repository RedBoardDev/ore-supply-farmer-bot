import type { RoundAccount } from '@osb/bot/application/decoders';
import type { PlacementDecision } from '@osb/bot/domain/services/ports/ev-strategy.port';
import type { RoundStreamContext, RoundStreamManager } from '@osb/bot/domain/types/round';

export class FakeRoundStreamManager implements RoundStreamManager {
  private decisions: PlacementDecision[];

  constructor(decisions: PlacementDecision[] = []) {
    this.decisions = [...decisions];
  }

  start(_context: RoundStreamContext): void {}
  updateContext(_updates: Partial<RoundStreamContext>): void {}
  getRound(): RoundAccount | null {
    return null;
  }
  peekTopDecision(): PlacementDecision | null {
    return this.decisions[0] ?? null;
  }
  getAllDecisions(): PlacementDecision[] {
    return [...this.decisions];
  }
  consumeDecision(): PlacementDecision | null {
    return this.decisions.shift() ?? null;
  }
  getCacheAge(): number {
    return 0;
  }
  getStats(): { totalUpdates: number; missedUpdates: number; cacheAgeMs: number; isActive: boolean } {
    return { totalUpdates: 0, missedUpdates: 0, cacheAgeMs: 0, isActive: false };
  }
  getLastRefreshDurationMs(): number {
    return 0;
  }
  isHealthy(): boolean {
    return true;
  }
  async refreshIfStale(_maxAgeMs?: number): Promise<boolean> {
    return true;
  }
  async forceRefresh(): Promise<boolean> {
    return true;
  }
  async stop(): Promise<void> {}
  clearDecisions(): void {
    this.decisions = [];
  }
}
