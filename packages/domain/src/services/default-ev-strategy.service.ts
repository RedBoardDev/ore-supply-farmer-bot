import type { Board } from '../aggregates/board.aggregate';
import type { Miner } from '../aggregates/miner.aggregate';
import type { Round } from '../aggregates/round.aggregate';
import { createChildLogger } from '../infrastructure/pino-logger';
import type { OrePrice } from '../value-objects/ore-price.vo';
import type { EvStrategyConfig, EvStrategyService, PlacementDecision } from './ev-strategy.service';

const log = createChildLogger('ev-strategy');

const PROBABILITY_OF_WIN = 1 / 25; // 4% chance per square
const SOL_PAYOUT_FEE_FACTOR = 0.9; // 90% after 10% program fee
const MOTHERLODE_TRIGGER_PROBABILITY = 1 / 625; // 0.16% chance
const EV_DENOMINATOR = 1 - PROBABILITY_OF_WIN * SOL_PAYOUT_FEE_FACTOR; // 0.964
const ORE_DECIMALS = 1_000_000_000;
const LAMPORTS_PER_SOL = 1_000_000_000n;

function computePotFromOthers(round: Round, miner: Miner): bigint {
  return round.deployed.reduce((acc, lamports, index) => {
    const mineLamports = index < miner.deployed.length ? (miner.deployed[index] ?? 0n) : 0n;
    const others = lamports > mineLamports ? lamports - mineLamports : 0n;
    return acc + others;
  }, 0n);
}

function computeExposureExistingSol(miner: Miner): number {
  return miner.deployed.reduce(
    (acc, lamports) => acc + Number(lamports) / Number(LAMPORTS_PER_SOL),
    0
  );
}

function computeNetOreValueSol(round: Round, price: OrePrice | null): number {
  if (!price || !price.netOrePerSol) return 0;
  const motherlodeOre = Number(round.motherlode) / ORE_DECIMALS;
  return (
    price.netOrePerSol *
    (1 + MOTHERLODE_TRIGGER_PROBABILITY * Math.max(motherlodeOre, 0))
  );
}

function computeEvRatio(params: {
  othersStakeSol: number;
  potFromOthersSol: number;
  exposureBeforeSol: number;
  stakeSol: number;
  netOreValueSol: number;
}): number {
  const { othersStakeSol, potFromOthersSol, exposureBeforeSol, stakeSol, netOreValueSol } = params;
  const denominator = othersStakeSol + stakeSol;
  if (denominator <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  const numerator =
    PROBABILITY_OF_WIN *
    (SOL_PAYOUT_FEE_FACTOR * (potFromOthersSol + exposureBeforeSol + stakeSol) + netOreValueSol);
  return numerator / denominator;
}

function solveMaxProfitableStake(params: {
  othersStakeSol: number;
  potFromOthersSol: number;
  exposureBeforeSol: number;
  netOreValueSol: number;
}): number {
  const { othersStakeSol, potFromOthersSol, exposureBeforeSol, netOreValueSol } = params;
  const numerator =
    PROBABILITY_OF_WIN * (SOL_PAYOUT_FEE_FACTOR * (potFromOthersSol + exposureBeforeSol) + netOreValueSol) -
    othersStakeSol;
  if (numerator <= 0) {
    return 0;
  }
  return numerator / EV_DENOMINATOR;
}

function solToLamports(value: number): bigint {
  return BigInt(Math.floor(value * Number(LAMPORTS_PER_SOL)));
}

interface CandidateSquare {
  index: number;
  othersStakeLamports: bigint;
  othersStakeSol: number;
  baselineEv: number;
  maxProfitableStake: number;
}

export class DefaultEvStrategyService implements EvStrategyService {
  private lastBestEvRatio: number | null = null;

  constructor(
    private readonly config: EvStrategyConfig,
  ) { }

  getLastBestEvRatio(): number | null {
    return this.lastBestEvRatio;
  }

  calculateDecisions(
    _board: Board,
    round: Round,
    miner: Miner,
    _orePerSol: number,
    netOrePerSol: number,
    walletBalanceLamports: bigint
  ): PlacementDecision[] {
    this.lastBestEvRatio = null;

    const totalSquares = round.deployed.length;
    const scanCount = Math.min(this.config.scanSquareCount, totalSquares);
    if (scanCount === 0) {
      return [];
    }

    const potFromOthersLamports = computePotFromOthers(round, miner);
    const potFromOthersSol = Number(potFromOthersLamports) / Number(LAMPORTS_PER_SOL);
    const exposureExistingSol = computeExposureExistingSol(miner);

    const balanceSol = Number(walletBalanceLamports) / Number(LAMPORTS_PER_SOL);
    const bufferSol = Number(this.config.balanceBufferLamports) / Number(LAMPORTS_PER_SOL);
    const spendableBalanceSol = Math.max(0, balanceSol - bufferSol);
    if (spendableBalanceSol <= 0) {
      log.debug('No spendable balance after reserve buffer; skipping placements.');
      return [];
    }

    const maxPlacementsSafe = Math.max(1, Math.min(this.config.maxPlacementsPerRound, 25));
    const minStakeSol = Number(this.config.minStakeLamports) / Number(LAMPORTS_PER_SOL);
    const capNormalSol = Number(this.config.capNormalLamports) / Number(LAMPORTS_PER_SOL);
    const capHighSol = Number(this.config.capHighEvLamports) / Number(LAMPORTS_PER_SOL);
    const maxExposureSol =
      this.config.maxExposureLamportsPerRound === null
        ? Number.POSITIVE_INFINITY
        : Number(this.config.maxExposureLamportsPerRound) / Number(LAMPORTS_PER_SOL);
    const baseStakePercent = this.config.baseStakePercent;
    const minEvThreshold = this.config.minEvRatio ?? Number.NEGATIVE_INFINITY;
    const volumeDecayPercent = this.config.volumeDecayPercentPerPlacement;

    const netOreValueSol = this.config.includeOreInEv ? netOrePerSol : 0;

    const candidates: CandidateSquare[] = [];
    let bestOthersStakeSol = 0;
    let bestCandidateEv = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < scanCount; index += 1) {
      const roundLamports = round.deployed[index] ?? 0n;
      const minerLamports = index < miner.deployed.length ? (miner.deployed[index] ?? 0n) : 0n;
      const othersLamports = roundLamports > minerLamports ? roundLamports - minerLamports : 0n;
      const othersSol = Number(othersLamports) / Number(LAMPORTS_PER_SOL);

      if (othersSol > bestOthersStakeSol) {
        bestOthersStakeSol = othersSol;
      }

      const baselineEv = computeEvRatio({
        othersStakeSol: othersSol,
        potFromOthersSol,
        exposureBeforeSol: exposureExistingSol,
        stakeSol: Math.max(minStakeSol, Number.EPSILON),
        netOreValueSol
      });

      const maxProfitableStake = solveMaxProfitableStake({
        othersStakeSol: othersSol,
        potFromOthersSol,
        exposureBeforeSol: exposureExistingSol,
        netOreValueSol
      });

      const candidate: CandidateSquare = {
        index,
        othersStakeLamports: othersLamports,
        othersStakeSol: othersSol,
        baselineEv,
        maxProfitableStake
      };
      candidates.push(candidate);
      if (Number.isFinite(candidate.baselineEv) && candidate.baselineEv > bestCandidateEv) {
        bestCandidateEv = candidate.baselineEv;
      }
    }

    candidates.sort((a, b) => {
      if (!Number.isFinite(b.baselineEv) && Number.isFinite(a.baselineEv)) {
        return 1;
      }
      if (!Number.isFinite(a.baselineEv) && Number.isFinite(b.baselineEv)) {
        return -1;
      }
      if (b.baselineEv !== a.baselineEv) {
        return b.baselineEv - a.baselineEv;
      }
      return b.maxProfitableStake - a.maxProfitableStake;
    });

    const baseStakeSol = Math.max(bestOthersStakeSol * baseStakePercent, minStakeSol);
    const availableExposureSol = Math.max(0, Math.min(maxExposureSol, spendableBalanceSol));
    if (availableExposureSol <= 0) {
      log.debug('Exposure cap reached before planning; skipping placements.');
      return [];
    }

    // Calculate volume decay based on viable candidates
    const viableCount = candidates.filter(c => Number.isFinite(c.baselineEv) && c.baselineEv > minEvThreshold).length;
    const plannedCount = Math.min(viableCount, maxPlacementsSafe);
    const decayFactor = Math.max(0.2, 1.0 - Math.max(0, plannedCount - 1) * (volumeDecayPercent / 100));

    if (decayFactor < 1.0) {
      log.debug(
        `Volume decay active: ${plannedCount} planned placements -> ${(decayFactor * 100).toFixed(1)}% stake sizing.`
      );
    }

    const decisions: PlacementDecision[] = [];
    let plannedExposureSol = 0;

    for (const candidate of candidates) {
      if (decisions.length >= maxPlacementsSafe) {
        break;
      }
      const remainingExposureSol = availableExposureSol - plannedExposureSol;
      if (remainingExposureSol <= 0) {
        break;
      }

      const exposureBeforeSol = exposureExistingSol + plannedExposureSol;
      let stakeSol = baseStakeSol;
      let capSol = capNormalSol;

      const initialEv = computeEvRatio({
        othersStakeSol: candidate.othersStakeSol,
        potFromOthersSol,
        exposureBeforeSol,
        stakeSol,
        netOreValueSol
      });

      // Calculate edge and apply square root for diminishing returns curve
      const edge = Math.max(0, initialEv - 1.0);
      const sqrtEdge = Math.sqrt(edge);

      // Dynamic cap: smooth transition from capNormal to capHigh based on sqrt(edge)
      const capRange = Math.max(0, capHighSol - capNormalSol);
      const cappedSqrtEdge = Math.min(1.0, sqrtEdge);
      capSol = capNormalSol + capRange * cappedSqrtEdge;
      const stakeLimit = Math.min(remainingExposureSol, spendableBalanceSol - plannedExposureSol, capSol);

      // Stake multiplier with diminishing returns (1 + sqrt(edge) x scalingFactor)
      const multiplier = 1 + sqrtEdge * this.config.stakeScalingFactor;
      stakeSol = Math.min(stakeSol * multiplier, stakeLimit);

      // Apply volume decay
      stakeSol *= decayFactor;

      stakeSol = Math.min(stakeSol, stakeLimit);
      if (stakeSol < minStakeSol) {
        const bumpedStake = Math.min(Math.max(minStakeSol, stakeSol), stakeLimit);
        if (bumpedStake < minStakeSol) {
          continue;
        }
        stakeSol = bumpedStake;
      }

      if (stakeSol < minStakeSol) {
        continue;
      }

      let evRatio = computeEvRatio({
        othersStakeSol: candidate.othersStakeSol,
        potFromOthersSol,
        exposureBeforeSol,
        stakeSol,
        netOreValueSol
      });

      if (evRatio <= minEvThreshold) {
        const maxStakeSol = solveMaxProfitableStake({
          othersStakeSol: candidate.othersStakeSol,
          potFromOthersSol,
          exposureBeforeSol,
          netOreValueSol
        });
        const adjustedStakeSol = Math.min(
          stakeLimit,
          Math.max(0, maxStakeSol)
        );

        // Apply volume decay to adjusted stake as well
        const finalAdjustedStakeSol = adjustedStakeSol * decayFactor;
        const bumpedAdjustedStake = Math.min(Math.max(finalAdjustedStakeSol, minStakeSol), stakeLimit);
        if (bumpedAdjustedStake < minStakeSol) {
          continue;
        }
        stakeSol = bumpedAdjustedStake;
        evRatio = computeEvRatio({
          othersStakeSol: candidate.othersStakeSol,
          potFromOthersSol,
          exposureBeforeSol,
          stakeSol,
          netOreValueSol
        });
        if (evRatio <= minEvThreshold) {
          continue;
        }
      }

      const amountLamports = solToLamports(stakeSol);
      if (amountLamports <= 0n) {
        continue;
      }

      decisions.push({
        squareIndex: candidate.index,
        amountLamports,
        evRatio,
        othersStakeLamports: candidate.othersStakeLamports
      });
      plannedExposureSol += stakeSol;
    }

    if (decisions.length === 0) {
      log.debug('Strategy planner did not find any profitable placements for this round.');
    } else {
      log.debug(
        `Planned ${decisions.length} placement(s); total exposure ${(plannedExposureSol).toFixed(6)} SOL.`
      );
    }

    if (decisions.length > 0) {
      const first = decisions[0];
      this.lastBestEvRatio = first?.evRatio ?? null;
    } else if (Number.isFinite(bestCandidateEv)) {
      this.lastBestEvRatio = bestCandidateEv;
    } else {
      this.lastBestEvRatio = null;
    }

    return decisions;
  }

  recalculateEv(params: {
    squareIndex: number;
    stakeLamports: bigint;
    round: Round;
    miner: Miner;
    orePrice: OrePrice | null;
    executedExposureLamports: bigint;
  }): { evRatio: number; othersStakeLamports: bigint } | null {
    const { squareIndex, stakeLamports, round, miner, orePrice, executedExposureLamports } = params;
    if (squareIndex < 0 || squareIndex >= round.deployed.length) {
      return null;
    }
    const minerLamports = squareIndex < miner.deployed.length ? (miner.deployed[squareIndex] ?? 0n) : 0n;
    const roundLamports = round.deployed[squareIndex] ?? 0n;
    const othersStakeLamports = roundLamports > minerLamports ? roundLamports - minerLamports : 0n;

    const potFromOthersLamports = computePotFromOthers(round, miner);
    const potFromOthersSol = Number(potFromOthersLamports) / Number(LAMPORTS_PER_SOL);
    const exposureExistingSol = computeExposureExistingSol(miner);
    const executedExposureSol = Number(executedExposureLamports) / Number(LAMPORTS_PER_SOL);
    const exposureBeforeSol = exposureExistingSol + Math.max(0, executedExposureSol);
    const netOreValueSol = this.config.includeOreInEv ? computeNetOreValueSol(round, orePrice) : 0;
    const stakeSol = Number(stakeLamports) / Number(LAMPORTS_PER_SOL);
    if (!Number.isFinite(stakeSol) || stakeSol <= 0) {
      return null;
    }
    const othersStakeSol = Number(othersStakeLamports) / Number(LAMPORTS_PER_SOL);
    const evRatio = computeEvRatio({
      othersStakeSol,
      potFromOthersSol,
      exposureBeforeSol,
      stakeSol,
      netOreValueSol
    });
    log.debug(
      `Recalculate EV -> square #${squareIndex + 1}, stake=${stakeSol.toFixed(6)} SOL, others=${othersStakeSol.toFixed(
        6
      )} SOL, exposure=${exposureBeforeSol.toFixed(6)} SOL, EV=${evRatio.toFixed(3)}`
    );
    return { evRatio, othersStakeLamports };
  }
}
