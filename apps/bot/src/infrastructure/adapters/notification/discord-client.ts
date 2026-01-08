import { createChildLogger } from '@osb/bot/infrastructure/logging/pino-logger';

const log = createChildLogger('discord');

interface DiscordField {
  name: string;
  value: string;
  inline?: boolean;
}

interface DiscordEmbed {
  title: string;
  description?: string;
  color?: number;
  fields?: DiscordField[];
  footer?: { text: string };
  timestamp?: string;
}

export class DiscordClient {
  private readonly webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  async sendEmbed(embed: DiscordEmbed): Promise<void> {
    try {
      const payload = {
        username: 'ORE Bot',
        embeds: [embed],
      };
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        log.warn(`Webhook responded with status ${response.status}`);
      }
    } catch (error) {
      log.warn(`Failed to send notification: ${(error as Error).message}`);
    }
  }
}
