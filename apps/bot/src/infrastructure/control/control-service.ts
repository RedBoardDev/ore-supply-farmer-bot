import { setSessionMetrics } from '@osb/bot/infrastructure/metrics/prometheus';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { BotLifecycleState, Core } from '../../application/orchestrator/core';

export interface BotStatus {
  state: BotLifecycleState;
  running: boolean;
  currentRound?: string;
  currentRoundEndSlot?: number;
  slotsRemaining?: number;
  totalStakeSol: number;
  totalRewardsSol: number;
  profitSol: number;
  roiPercent: number;
  sessionStartTime: number;
  roundsPlaced: number;
  wins: number;
  losses: number;
  motherlodes: number;
  uptimeSeconds: number;
  lastUpdated: number;
}

export interface ControlResult {
  success: boolean;
  message: string;
  timestamp: number;
  state?: BotLifecycleState;
}

export class BotControlService {
  private core: Core | null = null;
  private sessionStartTime: number;
  private placementsTotal = 0;
  private wins = 0;
  private losses = 0;
  private motherlodes = 0;
  private totalStakeLamports = 0n;
  private totalRewardsLamports = 0n;

  constructor() {
    this.sessionStartTime = Date.now();
  }

  /**
   * Register the core instance for control operations
   */
  registerCore(core: Core): void {
    this.core = core;
  }

  /**
   * Record a placement for session stats
   */
  recordPlacement(stakeLamports: bigint): void {
    if (stakeLamports <= 0n) return;
    this.placementsTotal += 1;
    this.totalStakeLamports += stakeLamports;
    this.syncSessionMetrics();
  }

  /**
   * Record a round outcome for session stats
   */
  recordRoundOutcome(won: boolean, motherlode: boolean, rewardLamports: bigint): void {
    if (won) {
      this.wins++;
      if (motherlode) {
        this.motherlodes++;
      }
    } else {
      this.losses++;
    }
    if (rewardLamports > 0n) {
      this.totalRewardsLamports += rewardLamports;
    }
    this.syncSessionMetrics();
  }

  /**
   * Get current bot status
   */
  getStatus(): BotStatus {
    const coreStatus = this.core?.getStatus();
    const currentTime = Date.now();
    const uptimeSeconds = Math.floor((currentTime - this.sessionStartTime) / 1000);

    const profitLamports = this.totalRewardsLamports - this.totalStakeLamports;
    const totalStakeSol = this.toSol(this.totalStakeLamports);
    const totalRewardsSol = this.toSol(this.totalRewardsLamports);
    const profitSol = this.toSol(profitLamports);
    const roiPercent =
      this.totalStakeLamports > 0n ? (Number(profitLamports) / Number(this.totalStakeLamports)) * 100 : 0;

    return {
      state: coreStatus?.state ?? 'stopped',
      running: coreStatus?.running ?? false,
      currentRound: coreStatus?.currentRound?.toString(),
      currentRoundEndSlot: coreStatus?.currentRoundEndSlot,
      slotsRemaining: coreStatus?.slotsRemaining,
      totalStakeSol,
      totalRewardsSol,
      profitSol,
      roiPercent,
      sessionStartTime: this.sessionStartTime,
      roundsPlaced: this.placementsTotal,
      wins: this.wins,
      losses: this.losses,
      motherlodes: this.motherlodes,
      uptimeSeconds,
      lastUpdated: currentTime,
    };
  }

  /**
   * Start or resume the bot
   */
  async start(): Promise<ControlResult> {
    if (!this.core) {
      return {
        success: false,
        message: 'Core not available',
        timestamp: Date.now(),
      };
    }

    await this.core.resume();
    const state = this.core.getStatus().state;

    return {
      success: true,
      message: 'Bot started',
      timestamp: Date.now(),
      state,
    };
  }

  /**
   * Pause the bot without stopping the process
   */
  async stop(): Promise<ControlResult> {
    if (!this.core) {
      return {
        success: false,
        message: 'Core not available',
        timestamp: Date.now(),
      };
    }

    await this.core.pause();
    const state = this.core.getStatus().state;

    return {
      success: true,
      message: 'Bot paused',
      timestamp: Date.now(),
      state,
    };
  }

  /**
   * Signal the bot to restart
   */
  restart(): ControlResult {
    if (!this.core) {
      return {
        success: false,
        message: 'Core not available',
        timestamp: Date.now(),
      };
    }

    process.env.ORE_BOT_RESTART = 'true';
    setTimeout(() => {
      process.kill(process.pid, 'SIGTERM');
    }, 250);

    return {
      success: true,
      message: 'Restart scheduled',
      timestamp: Date.now(),
      state: this.core.getStatus().state,
    };
  }

  /**
   * Health check
   */
  healthCheck(): { status: string; running: boolean; state: BotLifecycleState; timestamp: number } {
    return {
      status: this.core ? 'ok' : 'no_core',
      running: this.core?.getStatus().running ?? false,
      state: this.core?.getStatus().state ?? 'stopped',
      timestamp: Date.now(),
    };
  }

  private toSol(lamports: bigint): number {
    return Number(lamports) / LAMPORTS_PER_SOL;
  }

  private syncSessionMetrics(): void {
    const profitLamports = this.totalRewardsLamports - this.totalStakeLamports;
    setSessionMetrics({
      totalStakeSol: this.toSol(this.totalStakeLamports),
      totalRewardsSol: this.toSol(this.totalRewardsLamports),
      pnlSol: this.toSol(profitLamports),
    });
  }
}

// Singleton instance
let controlService: BotControlService | null = null;

export function getControlService(): BotControlService {
  if (!controlService) {
    controlService = new BotControlService();
  }
  return controlService;
}

export function registerControlService(core: Core): void {
  const service = getControlService();
  service.registerCore(core);
}
