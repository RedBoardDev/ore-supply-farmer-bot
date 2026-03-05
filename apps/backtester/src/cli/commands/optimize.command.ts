import fs from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { RunOptimizationUseCase } from '@backtester/application/use-cases/run-optimization.usecase';
import type { OptimizationParams } from '@backtester/domain/ports/optimizer.port';
import { createDefaultConfig } from '@backtester/domain/value-objects/backtest-config.vo';
import { createDefaultBounds, validateBounds } from '@backtester/domain/value-objects/optimization-bounds.vo';
import { ConsoleReportAdapter } from '@backtester/infrastructure/adapters/report/console-report.adapter';
import { BacktestSimulatorAdapter } from '@backtester/infrastructure/adapters/simulator/backtest-simulator.adapter';
import { SqliteHistoricalDataAdapter } from '@backtester/infrastructure/adapters/sqlite/sqlite-historical-data.adapter';
import { logInfo, logWarn, setLogLevel } from '@backtester/infrastructure/logging/levelled-logger';
import {
  validateBudgetParameter,
  validateEvRatioParameter,
  validateIterationsParameter,
  validateLogLevelParameter,
  validateRoundsParameter,
} from '@backtester/cli/validators';

interface OptimizeCommandOptions {
  budget: string;
  minEv?: string;
  maxEv?: string;
  rounds?: string;
  iterations?: string;
  config?: string;
  output?: string;
  logLevel?: string;
}

export function registerOptimizeCommand(program: Command): void {
  program
    .command('optimize')
    .description('Find optimal configuration through intelligent search')
    .requiredOption('-b, --budget <sol>', 'Initial SOL budget for optimization')
    .option('--min-ev <ratio>', 'Minimum EV ratio bound', '0.8')
    .option('--max-ev <ratio>', 'Maximum EV ratio bound', '2.0')
    .option('-n, --rounds <number>', 'Number of rounds to use (omit for all)')
    .option('--iterations <number>', 'Max optimization iterations', '100')
    .option('-c, --config <path>', 'Base config file to start from (optional)')
    .option('-o, --output <path>', 'Output best config to file')
    .option('-l, --log-level <level>', 'Log level (debug|info|warn|error|silent)', 'warn')
    .action(async (options: OptimizeCommandOptions) => {
      try {
        await executeOptimizeCommand(options);
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

async function executeOptimizeCommand(options: OptimizeCommandOptions): Promise<void> {
  const logLevel = validateLogLevelParameter(options.logLevel);
  setLogLevel(logLevel);

  const budgetSol = validateBudgetParameter(options.budget);
  const minEvRatio = validateEvRatioParameter(options.minEv ?? '0.8');
  const maxEvRatio = validateEvRatioParameter(options.maxEv ?? '2.0');
  const roundCount = options.rounds ? validateRoundsParameter(options.rounds) : null;
  const maxIterations = validateIterationsParameter(options.iterations ?? '100');

  const baseConfig = createDefaultConfig();

  if (options.config) {
    logWarn('Base config provided - feature not yet implemented, using defaults');
  }

  const defaultBounds = createDefaultBounds();
  const bounds = {
    ...defaultBounds,
    minEvRatio: [minEvRatio, maxEvRatio] as const,
  };

  try {
    validateBounds(bounds);
  } catch (error) {
    throw new Error(`Invalid bounds: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  let dbPath = path.join(process.cwd(), 'rounds.db');
  if (!fs.existsSync(dbPath)) {
    dbPath = path.join(process.cwd(), '../../rounds.db');
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Database not found at ${dbPath}`);
    }
  }

  const historicalData = new SqliteHistoricalDataAdapter(dbPath);
  const simulator = new BacktestSimulatorAdapter();
  const reportAdapter = new ConsoleReportAdapter();

  const useCase = new RunOptimizationUseCase(historicalData, simulator);

  logInfo('Fetching dataset info...');
  const datasetInfo = {
    totalRounds: await historicalData.getRoundCount(),
    oldestRoundId: await historicalData.getOldestRoundId(),
    latestRoundId: await historicalData.getLatestRoundId(),
  };
  logInfo(`Dataset contains ${datasetInfo.totalRounds} valid rounds`);
  logInfo(`Round ID range: ${datasetInfo.oldestRoundId} - ${datasetInfo.latestRoundId}`);
  logInfo('');

  const params: OptimizationParams = {
    initialBudgetSol: budgetSol,
    bounds,
    maxIterations,
    convergenceThreshold: 0.1,
    subSampleSize: roundCount,
  };

  const result = await useCase.execute({
    params,
    baseConfig,
    roundCount,
  });

  reportAdapter.generateOptimizationReport(result);

  if (options.output) {
    const outputPath = path.resolve(options.output);
    fs.writeFileSync(outputPath, stringifyWithBigInt(result.bestConfig), 'utf-8');
    logInfo(`\nBest configuration saved to: ${outputPath}`);
  }

  historicalData.close();
}

function stringifyWithBigInt(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, currentValue) => (typeof currentValue === 'bigint' ? currentValue.toString() : currentValue),
    2,
  );
}
