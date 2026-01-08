import { DiscordClient } from './discord-client';
import {
	buildFooter,
	buildLossSummary,
	buildStakeSummary,
	formatOre,
	formatSignedSol,
	getColorForType,
} from './discord-formatter';
import type { DiscordNotifier } from './discord-notifier.interface';
import type { NotificationMessage, NotificationPort } from './ports/notification.port';

export class DiscordNotifierAdapter implements DiscordNotifier, NotificationPort {
	private readonly client: DiscordClient;

	constructor(webhookUrl: string) {
		this.client = new DiscordClient(webhookUrl);
	}

	async sendWin(options: {
		roundId: bigint;
		winningSolLamports: bigint;
		winningOreAtoms: bigint;
		stakeLamports: bigint;
		pnlLamports: bigint;
		realPnlLamports: bigint;
		squareCount: number;
		lossesBeforeWin: number;
	}): Promise<void> {
		const {
			roundId,
			winningSolLamports: _winningSolLamports,
			winningOreAtoms,
			stakeLamports,
			pnlLamports,
			realPnlLamports,
			squareCount,
			lossesBeforeWin,
		} = options;

		await this.client.sendEmbed({
			title: `WIN | ${formatSignedSol(realPnlLamports)} SOL`,
			description: `${formatSignedSol(pnlLamports)} SOL - ${formatOre(winningOreAtoms)} ORE`,
			fields: [
				{ name: 'Your Stake', value: buildStakeSummary(stakeLamports, squareCount) },
				{ name: 'Loss Streak Before Win', value: buildLossSummary(lossesBeforeWin) },
			],
			color: getColorForType('win'),
			footer: { text: buildFooter(roundId) },
		});
	}

	async sendLoss(options: {
		roundId: bigint;
		stakeLamports: bigint;
		squareCount: number;
		lossStreak: number;
	}): Promise<void> {
		const { roundId, stakeLamports, squareCount, lossStreak } = options;

		await this.client.sendEmbed({
			title: `LOSE | streak of ${lossStreak} losses`,
			fields: [{ name: 'Your Stake', value: buildStakeSummary(stakeLamports, squareCount) }],
			color: getColorForType('loss'),
			footer: { text: buildFooter(roundId) },
		});
	}

	async send(message: NotificationMessage): Promise<void> {
		await this.client.sendEmbed({
			title: message.title,
			description: message.message,
			color: getColorForType(message.type),
			timestamp: new Date(message.timestamp ?? Date.now()).toISOString(),
			fields: message.data
				? Object.entries(message.data).map(([k, v]) => ({
					name: k,
					value: String(v),
					inline: true,
				}))
				: [],
		});
	}
}
