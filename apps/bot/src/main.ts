import { createPinoLogger } from '@osb/domain';
import { createOreBot } from './application/ore-bot';

const logger = createPinoLogger({ name: 'osb' });

async function main(): Promise<void> {
  logger.info("OSB starting...");

  const bot = createOreBot();

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    await bot.stop();
    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await bot.start();

    // Keep process alive
    if (process.env.NODE_ENV !== 'test') {
      logger.info('Bot is running. Press Ctrl+C to stop.');
      // Prevent process from exiting
      await new Promise(() => { });
    }
  } catch (error) {
    logger.error('Fatal error starting bot', error as Error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
