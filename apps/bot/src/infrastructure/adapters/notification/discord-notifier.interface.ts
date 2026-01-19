import type { NotificationPort } from './ports/notification.port';

export interface DiscordNotifier extends NotificationPort {
  sendWin(options: {
    roundId: bigint;
    winningSolLamports: bigint;
    winningOreAtoms: bigint;
    stakeLamports: bigint;
    pnlLamports: bigint;
    realPnlLamports: bigint;
    squareCount: number;
    lossesBeforeWin: number;
  }): Promise<void>;
  sendLoss(options: { roundId: bigint; stakeLamports: bigint; squareCount: number; lossStreak: number }): Promise<void>;
}
