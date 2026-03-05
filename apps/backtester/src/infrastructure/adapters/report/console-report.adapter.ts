import chalk from 'chalk';
import Table from 'cli-table3';
import type { ReportPort } from '@backtester/domain/ports/report.port';
import type { BacktestResult } from '@backtester/domain/aggregates/backtest-result.aggregate';
import type { OptimizationResult } from '@backtester/domain/ports/optimizer.port';
import { toSol } from '@backtester/domain/entities/simulated-round.entity';

export class ConsoleReportAdapter implements ReportPort {
  generateTestReport(result: BacktestResult, verbose: boolean = false): void {
    this.printHeader('BACKTEST RESULTS - Config Test');
    this.printConfiguration(result);
    this.printDataRange(result);
    this.printPerformanceSummary(result);
    this.printWinLossStatistics(result);
    this.printRiskMetrics(result);
    this.printPerformanceGrade(result);

    if (verbose) {
      console.log('');
      this.generatePerRoundBreakdown(result, 10);
    }
  }

  generateOptimizationReport(result: OptimizationResult): void {
    this.printHeader('OPTIMIZATION RESULTS');

    console.log(chalk.cyan('\nBest Configuration Found:'));
    console.log(`  Min EV Ratio:              ${result.bestConfig.minEvRatio?.toFixed(2) ?? 'null'}`);
    console.log(`  Base Stake:                ${(result.bestConfig.baseStakePercent * 100).toFixed(2)}%`);
    console.log(`  Stake Scaling Factor:      ${result.bestConfig.stakeScalingFactor.toFixed(1)}`);
    console.log(`  Max Placements/Round:      ${result.bestConfig.maxPlacementsPerRound}`);
    console.log(`  Cap Normal:                ${toSol(result.bestConfig.capNormalLamports).toFixed(3)} SOL`);
    console.log(`  Cap High EV:               ${toSol(result.bestConfig.capHighEvLamports).toFixed(3)} SOL`);
    console.log(`  Balance Buffer:            ${toSol(result.bestConfig.balanceBufferLamports).toFixed(3)} SOL`);
    console.log(`  Volume Decay:              ${result.bestConfig.volumeDecayPercentPerPlacement.toFixed(1)}%`);

    console.log(chalk.cyan('\nBest Performance Metrics:'));
    console.log(`  ROI:                       ${chalk.green(result.bestMetrics.roi.toFixed(2) + '%')}`);
    console.log(`  Win Rate:                  ${(result.bestMetrics.winRate * 100).toFixed(2)}%`);
    console.log(`  Total P&L:                 ${this.formatPnl(result.bestMetrics.totalPnlSol)}`);
    console.log(`  Sharpe Ratio:              ${result.bestMetrics.sharpeRatio.toFixed(2)}`);

    console.log(chalk.cyan('\nOptimization Statistics:'));
    console.log(`  Iterations:                ${result.iterations}`);
    console.log(`  Configurations Tested:     ${result.allResults.length}`);
    console.log(`  Elapsed Time:              ${(result.elapsedMs / 1000).toFixed(1)}s`);

    if (result.convergenceHistory.length > 0) {
      const improvement = result.convergenceHistory[result.convergenceHistory.length - 1] -
        result.convergenceHistory[0];
      console.log(`  ROI Improvement:           ${chalk.green('+' + improvement.toFixed(2) + '%')}`);
    }

    this.printTopConfigurations(result);
  }

  generatePerRoundBreakdown(result: BacktestResult, limit: number = 10): void {
    const bestRounds = result.getBestRounds(limit);
    const worstRounds = result.getWorstRounds(limit);

    if (bestRounds.length > 0) {
      this.printHeader(`Top ${bestRounds.length} Best Rounds`);

      const table = new Table({
        head: ['Round', 'Stake', 'Reward', 'P&L', 'ROI', 'Squares'],
        colAligns: ['right', 'right', 'right', 'right', 'right', 'left'],
      });

      for (const round of bestRounds) {
        const stake = toSol(round.totalStakeLamports).toFixed(4);
        const reward = toSol(round.rewardLamports).toFixed(4);
        const pnl = toSol(round.pnlLamports).toFixed(4);
        const roi = ((Number(round.pnlLamports) / Number(round.totalStakeLamports)) * 100).toFixed(0) + '%';
        const squares = `[${round.decisions.map((d) => d.squareIndex).join(',')}]`;

        table.push([
          round.roundId.toString(),
          stake,
          chalk.green(reward),
          chalk.green('+' + pnl),
          chalk.green(roi),
          squares,
        ]);
      }

      console.log(table.toString());
    }

    if (worstRounds.length > 0) {
      console.log('');
      this.printHeader(`Top ${worstRounds.length} Worst Rounds`);

      const table = new Table({
        head: ['Round', 'Stake', 'P&L', 'Squares'],
        colAligns: ['right', 'right', 'right', 'left'],
      });

      for (const round of worstRounds) {
        const stake = toSol(round.totalStakeLamports).toFixed(4);
        const pnl = toSol(round.pnlLamports).toFixed(4);
        const squares = `[${round.decisions.map((d) => d.squareIndex).join(',')}]`;

        table.push([
          round.roundId.toString(),
          stake,
          chalk.red(pnl),
          squares,
        ]);
      }

      console.log(table.toString());
    }
  }

  private printHeader(title: string): void {
    const border = '═'.repeat(63);
    console.log('');
    console.log(chalk.cyan('╔' + border + '╗'));
    console.log(chalk.cyan('║') + chalk.bold(title.padStart(38).padEnd(63)) + chalk.cyan('║'));
    console.log(chalk.cyan('╚' + border + '╝'));
    console.log('');
  }

  private printConfiguration(result: BacktestResult): void {
    console.log(chalk.cyan('Configuration:'));
    const config = result.config;
    console.log(`  Min EV Ratio:               ${config.minEvRatio?.toFixed(2) ?? 'null'}`);
    console.log(`  Base Stake:                 ${(config.baseStakePercent * 100).toFixed(2)}%`);
    console.log(`  Stake Scaling Factor:       ${config.stakeScalingFactor.toFixed(1)}`);
    console.log(`  Max Placements/Round:       ${config.maxPlacementsPerRound}`);
    console.log(`  Cap Normal:                 ${toSol(config.capNormalLamports).toFixed(2)} SOL`);
    console.log(`  Cap High EV:                ${toSol(config.capHighEvLamports).toFixed(2)} SOL`);
    console.log('');
  }

  private printDataRange(result: BacktestResult): void {
    console.log(chalk.cyan('Data Range:'));
    const metrics = result.metrics;
    console.log(`  Rounds Analyzed:            ${metrics.totalRounds.toLocaleString()}`);
    console.log(`  Rounds Played:              ${metrics.roundsPlayed.toLocaleString()} (${((metrics.roundsPlayed / metrics.totalRounds) * 100).toFixed(1)}%)`);
    console.log(`  Rounds Skipped:             ${metrics.roundsSkipped.toLocaleString()} (${((metrics.roundsSkipped / metrics.totalRounds) * 100).toFixed(1)}%)`);
    console.log('');
  }

  private printPerformanceSummary(result: BacktestResult): void {
    console.log(chalk.cyan('Performance Summary:'));
    const metrics = result.metrics;
    const initialSol = toSol(result.initialBalanceLamports);

    console.log(`  Initial Balance:            ${initialSol.toFixed(2)} SOL`);
    console.log(`  Final Balance:              ${metrics.finalBalanceSol.toFixed(2)} SOL`);
    console.log(`  Total P&L:                  ${this.formatPnl(metrics.totalPnlSol)}`);
    console.log('');
    console.log(`  Total Stake Deployed:       ${metrics.totalStakeSol.toFixed(2)} SOL`);
    console.log(`  Total Rewards:              ${metrics.totalRewardsSol.toFixed(2)} SOL`);
    console.log(`  ROI:                        ${chalk.bold(this.formatROI(metrics.roi))}`);
    console.log('');
  }

  private printWinLossStatistics(result: BacktestResult): void {
    console.log(chalk.cyan('Win/Loss Statistics:'));
    const metrics = result.metrics;
    console.log(`  Wins:                       ${metrics.wins.toLocaleString()}`);
    console.log(`  Losses:                     ${metrics.losses.toLocaleString()}`);
    console.log(`  Win Rate:                   ${(metrics.winRate * 100).toFixed(2)}%`);
    console.log('');
    console.log(`  Average Stake/Round:        ${metrics.averageStakePerRound.toFixed(4)} SOL`);
    console.log(`  Average EV Score:           ${metrics.averageEvScore.toFixed(2)}`);
    console.log('');
  }

  private printRiskMetrics(result: BacktestResult): void {
    console.log(chalk.cyan('Risk Metrics:'));
    const metrics = result.metrics;
    console.log(`  Max Drawdown:               ${chalk.red('-' + metrics.maxDrawdownSol.toFixed(2) + ' SOL')} (${(metrics.maxDrawdownSol / toSol(result.initialBalanceLamports) * 100).toFixed(1)}%)`);
    console.log(`  Sharpe Ratio:               ${metrics.sharpeRatio.toFixed(2)}`);
    console.log('');
  }

  private printPerformanceGrade(result: BacktestResult): void {
    const roi = result.metrics.roi;
    let grade = 'F';
    let color = chalk.red;

    if (roi > 20) {
      grade = 'A+';
      color = chalk.green;
    } else if (roi > 10) {
      grade = 'A';
      color = chalk.green;
    } else if (roi > 5) {
      grade = 'B+';
      color = chalk.yellow;
    } else if (roi > 0) {
      grade = 'B';
      color = chalk.yellow;
    } else {
      grade = 'F';
      color = chalk.red;
    }

    console.log(chalk.cyan('Performance Grade:           ') + color.bold(grade));
    console.log('');
  }

  private printTopConfigurations(result: OptimizationResult): void {
    const topN = Math.min(5, result.allResults.length);
    const sortedResults = [...result.allResults].sort((a, b) => b.metrics.roi - a.metrics.roi);

    console.log(chalk.cyan(`\nTop ${topN} Configurations:`));

    const table = new Table({
      head: ['Rank', 'MinEV', 'BaseStake%', 'ScaleFactor', 'MaxPlace', 'ROI%'],
      colAligns: ['center', 'right', 'right', 'right', 'center', 'right'],
    });

    for (let i = 0; i < topN; i++) {
      const r = sortedResults[i];
      table.push([
        (i + 1).toString(),
        r.config.minEvRatio?.toFixed(2) ?? 'null',
        (r.config.baseStakePercent * 100).toFixed(1),
        r.config.stakeScalingFactor.toFixed(1),
        r.config.maxPlacementsPerRound.toString(),
        chalk.green(r.metrics.roi.toFixed(2)),
      ]);
    }

    console.log(table.toString());
  }

  private formatPnl(pnl: number): string {
    if (pnl > 0) {
      return chalk.green(`+${pnl.toFixed(2)} SOL (+${((pnl / 10) * 100).toFixed(1)}%)`);
    } else if (pnl < 0) {
      return chalk.red(`${pnl.toFixed(2)} SOL (${((pnl / 10) * 100).toFixed(1)}%)`);
    } else {
      return '0.00 SOL (0.0%)';
    }
  }

  private formatROI(roi: number): string {
    if (roi > 0) {
      return chalk.green(roi.toFixed(2) + '%');
    } else if (roi < 0) {
      return chalk.red(roi.toFixed(2) + '%');
    } else {
      return '0.00%';
    }
  }
}
