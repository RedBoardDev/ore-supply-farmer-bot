import { createChildLogger, createPinoLogger } from '@osb/domain';
import { OreBot } from './application/bot';

createPinoLogger({ name: 'osb' });

const log = createChildLogger('main');

async function main(): Promise<void> {
  log.info('OSB starting...');

  const bot = new OreBot();

  const shutdown = async (signal: string) => {
    log.info(`Received ${signal}, shutting down gracefully...`);
    await bot.stop();
    log.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await bot.start();

    // Keep process alive
    if (process.env.NODE_ENV !== 'test') {
      log.info('Bot is running. Press Ctrl+C to stop.');
      // Prevent process from exiting
      await new Promise(() => { });
    }
  } catch (error) {
    log.error('Fatal error starting bot', error as Error);
    process.exit(1);
  }
}

main().catch((error) => {
  log.error('Unhandled error', error as Error);
  process.exit(1);
});
