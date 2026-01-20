import type { MinerAccount, RoundAccount } from '@osb/bot/application/decoders';
import { ensureCheckpoint as ensureCheckpointUsecase } from '@osb/bot/application/use-cases/checkpoint/checkpoint-usecase';
import {
  type PlacementPrefetcher,
  PlacementPrefetcherAdapter,
} from '@osb/bot/application/use-cases/execute-placement/prefetcher/placement-prefetcher';
import { CheckpointService } from '@osb/bot/domain/services/checkpoint.service';
import { EvStrategyService } from '@osb/bot/domain/services/ev-strategy.service';
import { FileLatencyStorage, LatencyServiceAdapter } from '@osb/bot/domain/services/latency.service';
import { MiningCostStrategy } from '@osb/bot/domain/services/mining-cost-strategy.service';
import type { BlockchainPort } from '@osb/bot/domain/services/ports/blockchain.port';
import type { EvStrategyServicePort, PlacementDecision } from '@osb/bot/domain/services/ports/ev-strategy.port';
import type { LatencyStoragePort } from '@osb/bot/domain/services/ports/latency.port';
import type { PricePort, PriceQuote } from '@osb/bot/domain/services/ports/price.port';
import {
  type InstructionCache,
  InstructionCacheAdapter,
} from '@osb/bot/infrastructure/adapters/cache/instruction-cache.adapter';
import { SlotCacheAdapter } from '@osb/bot/infrastructure/adapters/cache/slot-cache.adapter';
import { ConsoleNotifierAdapter } from '@osb/bot/infrastructure/adapters/notification/console-notifier.adapter';
import { DiscordNotifierAdapter } from '@osb/bot/infrastructure/adapters/notification/discord-notifier.adapter';
import type { DiscordNotifier } from '@osb/bot/infrastructure/adapters/notification/discord-notifier.interface';
import { MultiNotifierAdapter } from '@osb/bot/infrastructure/adapters/notification/multi-notifier.adapter';
import type { NotificationPort } from '@osb/bot/infrastructure/adapters/notification/ports/notification.port';
import { JupiterPriceAdapter } from '@osb/bot/infrastructure/adapters/price/jupiter-price.adapter';
import {
  type RoundMetricsManager,
  RoundMetricsManagerAdapter,
} from '@osb/bot/infrastructure/adapters/round/round-metrics';
import {
  type RoundStreamManager,
  RoundStreamManagerAdapter,
} from '@osb/bot/infrastructure/adapters/round/round-stream-manager.adapter';
import { TransactionBuilder } from '@osb/bot/infrastructure/adapters/transaction/transaction-builder';
import { TransactionSender } from '@osb/bot/infrastructure/adapters/transaction/transaction-sender.adapter';
import { type BoardWatcher, BoardWatcherAdapter } from '@osb/bot/infrastructure/adapters/watch/board-watcher.adapter';
import { createChildLogger } from '@osb/bot/infrastructure/logging/pino-logger';
import type { ConfigSchema } from '@osb/config';
import type { EnvSchema } from '@osb/config/env';
import { Miner, Round, RoundId } from '@osb/domain';
import { Connection, Keypair, type PublicKey } from '@solana/web3.js';
import { type BlockhashCache, BlockhashCacheAdapter } from '../adapters/blockchain/blockhash-cache.adapter';
import { SolanaBlockchainAdapter } from '../adapters/blockchain/solana.adapter';
import { type Container, getGlobalContainer } from './container';

const log = createChildLogger('bot-registry');

export function IoCmoduleRegistry(botConfig: ConfigSchema, env: EnvSchema): Container {
  const container = getGlobalContainer();
  // Ensure a clean container when re-initializing in the same process.
  container.clear();

  container.registerInstance('BotConfig', botConfig);

  // Solana Connection
  container.register(
    'SolanaConnection',
    () =>
      new Connection(botConfig.rpc.httpEndpoint, {
        commitment: botConfig.rpc.commitment,
        wsEndpoint: botConfig.rpc.wsEndpoint,
      }),
  );

  // Slot Cache (WebSocket-based slot updates)
  const solanaConnection = container.resolve<Connection>('SolanaConnection');
  container.registerInstance('SlotCache', new SlotCacheAdapter(solanaConnection));

  // Wallet keypair - only required in live mode
  container.register('WalletKeypair', () => {
    const envVar = env.WALLET_KEYPAIR;
    const privateKeyBase58 = process.env[envVar];

    // Try fallback env var if primary not set
    if (!privateKeyBase58) {
      throw new Error(`Missing wallet keypair env var: ${envVar}`);
    }

    // Parse private key from various formats
    try {
      // Try JSON format first
      if (privateKeyBase58.startsWith('[')) {
        const keyArray = JSON.parse(privateKeyBase58);
        return Buffer.from(keyArray);
      }

      // Try comma-separated format
      if (privateKeyBase58.includes(',')) {
        const keyArray = privateKeyBase58.split(',').map(Number);
        return Buffer.from(keyArray);
      }

      // Default: base58 format
      const bs58 = require('bs58');
      return Buffer.from(bs58.decode(privateKeyBase58));
    } catch (error) {
      throw new Error(`Failed to parse wallet keypair: ${(error as Error).message}`);
    }
  });

  // Authority Keypair (for transactions) - only in live mode
  container.register('AuthorityKeypair', () => {
    const keypairBuffer = container.resolve<Buffer>('WalletKeypair');
    if (!keypairBuffer) {
      throw new Error('Wallet keypair not available');
    }
    return Keypair.fromSecretKey(keypairBuffer);
  });

  // Authority PublicKey
  container.register('AuthorityPublicKey', () => {
    const keypair = container.resolve<Keypair>('AuthorityKeypair');
    return keypair.publicKey;
  });

  // Blockchain Adapter (use shared Solana connection)
  container.registerInstance<BlockchainPort>(
    'BlockchainPort',
    new SolanaBlockchainAdapter(solanaConnection, botConfig),
  );

  // Price Adapter
  container.registerInstance<PricePort>('PricePort', new JupiterPriceAdapter(env));

  // Notification Port + Discord notifier
  const webhookUrl = botConfig.telemetry.discordWebhookUrl;
  const consoleNotifier = new ConsoleNotifierAdapter();
  const discordNotifier: DiscordNotifier | null = webhookUrl ? new DiscordNotifierAdapter(webhookUrl) : null;
  const notificationPort: NotificationPort = discordNotifier
    ? new MultiNotifierAdapter([consoleNotifier, discordNotifier])
    : consoleNotifier;

  container.registerInstance<NotificationPort>('NotificationPort', notificationPort);
  container.registerInstance<DiscordNotifier | null>('DiscordNotifier', discordNotifier);

  // Transaction Builder
  container.registerInstance('TransactionBuilder', new TransactionBuilder());

  // Transaction Sender
  container.register('TransactionSender', () => {
    const connection = container.resolve<Connection>('SolanaConnection');
    // const blockchain = container.resolve<BlockchainPort>('BlockchainPort');
    return new TransactionSender(connection, botConfig);
  });

  // EV Strategy Service
  container.registerInstance<EvStrategyServicePort>(
    'EvStrategyService',
    new EvStrategyService({
      baseStakePercent: botConfig.strategy.baseStakePercent,
      minEvRatio: botConfig.strategy.minEvRatio,
      capNormalLamports: botConfig.strategy.capNormalLamports,
      capHighEvLamports: botConfig.strategy.capHighEvLamports,
      maxPlacementsPerRound: botConfig.strategy.maxPlacementsPerRound,
      maxExposureLamportsPerRound: botConfig.strategy.maxExposureLamportsPerRound,
      balanceBufferLamports: botConfig.strategy.balanceBufferLamports,
      minStakeLamports: botConfig.strategy.minStakeLamports,
      scanSquareCount: botConfig.strategy.scanSquareCount,
      includeOreInEv: botConfig.strategy.includeOreInEv,
      stakeScalingFactor: botConfig.strategy.stakeScalingFactor,
      volumeDecayPercentPerPlacement: botConfig.strategy.stakeDecayPercent,
    }),
  );

  // Checkpoint Service
  container.registerInstance<CheckpointService>('CheckpointService', new CheckpointService());

  // Latency Service
  container.register(
    'LatencyService',
    () =>
      new LatencyServiceAdapter({
        slotDurationMs: botConfig.timing.latencyService.slotDurationMs,
        smoothing: botConfig.timing.latencyService.smoothing,
        initialPrepMs: botConfig.timing.latencyService.initialPrepMs,
        initialExecPerPlacementMs: botConfig.timing.latencyService.initialExecPerPlacementMs,
        maxSamples: botConfig.timing.latencyService.maxSamples,
      }),
  );

  // Latency Storage
  container.registerInstance<LatencyStoragePort>(
    'LatencyStoragePort',
    new FileLatencyStorage({
      path: botConfig.timing.latencyMetricsPath,
      maxEntries: botConfig.timing.latencyHistorySize,
      flushIntervalMs: 5000,
    }),
  );

  // ============================================================================
  // Adapters
  // ============================================================================

  // Instruction Cache
  container.registerInstance<InstructionCache>('InstructionCache', new InstructionCacheAdapter());

  // Blockhash Cache
  container.registerInstance<BlockhashCache>(
    'BlockhashCache',
    new BlockhashCacheAdapter({
      connection: solanaConnection,
      commitment: botConfig.rpc.commitment,
      refreshIntervalMs: 200,
    }),
  );

  // Board Watcher
  container.registerInstance<BoardWatcher>(
    'BoardWatcher',
    new BoardWatcherAdapter({
      connection: solanaConnection,
      commitment: botConfig.rpc.commitment,
      pollIntervalMs: botConfig.timing.boardPollIntervalMs,
    }),
  );

  // Round Stream Manager
  container.registerInstance<RoundStreamManager>(
    'RoundStreamManager',
    new RoundStreamManagerAdapter({
      connection: solanaConnection,
      commitment: botConfig.rpc.commitment,
      strategyPlanner: {
        buildPlan: (context: {
          round: RoundAccount;
          miner: MinerAccount;
          walletBalanceLamports: bigint;
          priceQuote: PriceQuote;
          maxPlacements: number;
        }): PlacementDecision[] => {
          let decisions: PlacementDecision[] = [];
          try {
            const evStrategy = container.resolve<EvStrategyServicePort>('EvStrategyService');
            const round = Round.create(
              RoundId.create(context.round.id),
              context.round.deployed,
              context.round.motherlode,
              context.round.expiresAt,
            );
            const miner = Miner.create(
              context.miner.authority.toBase58(),
              context.miner.deployed,
              context.miner.rewardsSol,
              context.miner.rewardsOre,
              context.miner.checkpointId,
              context.miner.roundId,
            );
            decisions = evStrategy.calculateDecisions(
              null,
              round,
              miner,
              context.priceQuote?.solPerOre ?? 0.5,
              context.priceQuote?.netSolPerOre ?? 0.45,
              context.walletBalanceLamports,
            );
          } catch (error) {
            log.debug(`Stream buildPlan failed: ${(error as Error).message}`);
          }
          return decisions;
        },
      },
    }),
  );

  // Placement Prefetcher
  const blockchainPort = container.resolve<BlockchainPort>('BlockchainPort');
  container.registerInstance<PlacementPrefetcher>(
    'PlacementPrefetcher',
    new PlacementPrefetcherAdapter({
      connection: solanaConnection,
      commitment: botConfig.rpc.commitment,
      authorityPublicKey: container.resolve<PublicKey>('AuthorityPublicKey'),
      ensureCheckpoint: (roundId: bigint) =>
        ensureCheckpointUsecase(blockchainPort, RoundId.create(roundId), botConfig, log),
    }),
  );

  // Round Metrics Manager
  container.registerInstance<RoundMetricsManager>(
    'RoundMetricsManager',
    new RoundMetricsManagerAdapter(
      container.resolve<DiscordNotifier | null>('DiscordNotifier'),
      container.resolve<PricePort>('PricePort'),
    ),
  );

  // Mining Cost Strategy
  container.registerInstance<MiningCostStrategy>(
    'MiningCostStrategy',
    new MiningCostStrategy({
      enabled: botConfig.miningCost.enabled,
      thresholdPercent: botConfig.miningCost.thresholdPercent,
      historyRounds: botConfig.miningCost.historyRounds,
    }),
  );

  return container;
}
