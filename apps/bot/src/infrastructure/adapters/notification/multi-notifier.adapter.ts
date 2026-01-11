import { createChildLogger } from '@osb/bot/infrastructure/logging/pino-logger';
import type { NotificationMessage, NotificationPort } from './ports/notification.port';

const log = createChildLogger('multi-notifier');

export class MultiNotifierAdapter implements NotificationPort {
  constructor(private readonly notifiers: NotificationPort[]) {}

  async send(message: NotificationMessage): Promise<void> {
    if (this.notifiers.length === 0) {
      return;
    }

    const results = await Promise.allSettled(this.notifiers.map((notifier) => notifier.send(message)));
    for (const result of results) {
      if (result.status === 'rejected') {
        log.warn(`Notifier failed: ${String(result.reason)}`);
      }
    }
  }
}
