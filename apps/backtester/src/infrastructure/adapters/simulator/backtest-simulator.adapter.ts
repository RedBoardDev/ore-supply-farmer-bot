import { EvSimulatorService } from '@backtester/application/services/ev-simulator.service';
import { BacktestResult } from '@backtester/domain/aggregates/backtest-result.aggregate';
import type { HistoricalRound } from '@backtester/domain/entities/historical-round.entity';
import type { SimulatedRound } from '@backtester/domain/entities/simulated-round.entity';
import { createSimulatedRound } from '@backtester/domain/entities/simulated-round.entity';
import type { SimulationContext, SimulatorPort } from '@backtester/domain/ports/simulator.port';
import { logDebug, logInfo, logWarn } from '@backtester/infrastructure/logging/levelled-logger';

export class BacktestSimulatorAdapter implements SimulatorPort {
  simulateRound(round: HistoricalRound, context: SimulationContext, currentBalanceLamports: bigint): SimulatedRound {
    const evSimulator = new EvSimulatorService(context.config);

    const spendableBalance = this.calculateSpendableBalance(
      currentBalanceLamports,
      context.config.balanceBufferLamports,
    );

    const decisions = evSimulator.simulatePlacements(round, spendableBalance);

    const totalStake = decisions.reduce((sum, d) => sum + d.amountLamports, 0n);

    if (totalStake > spendableBalance) {
      logWarn(
        `Round ${round.roundId}: Total stake (${totalStake}) exceeds spendable balance (${spendableBalance}). Skipping.`,
      );
      return this.createNoActionRound(round, currentBalanceLamports);
    }

    const totalPot = this.calculateTotalPot(round);

    return createSimulatedRound({
      roundId: round.roundId,
      decisions,
      winningTile: round.winningTile,
      balanceBeforeLamports: currentBalanceLamports,
      totalPotLamports: totalPot,
      winningSquarePotLamports: round.deployed[round.winningTile] ?? 0n,
    });
  }

  async simulateBatch(rounds: readonly HistoricalRound[], context: SimulationContext): Promise<BacktestResult> {
    const evSimulator = new EvSimulatorService(context.config);
    const simulatedRounds: SimulatedRound[] = [];

    let currentBalance = context.initialBalanceLamports;

    for (let i = 0; i < rounds.length; i++) {
      const round = rounds[i];

      if (i % 1000 === 0 && i > 0) {
        logDebug(`Simulated ${i} / ${rounds.length} rounds...`);
      }

      const spendableBalance = this.calculateSpendableBalance(currentBalance, context.config.balanceBufferLamports);

      if (spendableBalance <= 0n) {
        logWarn(`Round ${round.roundId}: No spendable balance. Skipping remaining rounds.`);
        const noActionRound = this.createNoActionRound(round, currentBalance);
        simulatedRounds.push(noActionRound);
        currentBalance = noActionRound.balanceAfterLamports;
        continue;
      }

      const decisions = evSimulator.simulatePlacements(round, spendableBalance);

      const totalStake = decisions.reduce((sum, d) => sum + d.amountLamports, 0n);

      if (totalStake > spendableBalance) {
        logWarn(`Round ${round.roundId}: Total stake exceeds spendable balance. Skipping round.`);
        const noActionRound = this.createNoActionRound(round, currentBalance);
        simulatedRounds.push(noActionRound);
        currentBalance = noActionRound.balanceAfterLamports;
        continue;
      }

      const totalPot = this.calculateTotalPot(round);

      const simRound = createSimulatedRound({
        roundId: round.roundId,
        decisions,
        winningTile: round.winningTile,
        balanceBeforeLamports: currentBalance,
        totalPotLamports: totalPot,
        winningSquarePotLamports: round.deployed[round.winningTile] ?? 0n,
      });

      simulatedRounds.push(simRound);
      currentBalance = simRound.balanceAfterLamports;

      if (currentBalance < 0n) {
        throw new Error(`Round ${round.roundId}: Balance went negative (${currentBalance})`);
      }
    }

    logInfo(`Simulation complete: ${simulatedRounds.length} rounds processed.`);

    return BacktestResult.fromSimulation(context.config, simulatedRounds, context.initialBalanceLamports);
  }

  private calculateSpendableBalance(currentBalance: bigint, bufferLamports: bigint): bigint {
    const spendable = currentBalance - bufferLamports;
    return spendable > 0n ? spendable : 0n;
  }

  private calculateTotalPot(round: HistoricalRound): bigint {
    return round.deployed.reduce((sum, d) => sum + d, 0n);
  }

  private createNoActionRound(round: HistoricalRound, balanceLamports: bigint): SimulatedRound {
    return createSimulatedRound({
      roundId: round.roundId,
      decisions: [],
      winningTile: round.winningTile,
      balanceBeforeLamports: balanceLamports,
      totalPotLamports: 0n,
      winningSquarePotLamports: 0n,
    });
  }
}
