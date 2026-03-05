import { z } from 'zod';

export const simulationParamsSchema = z.object({
  roundCount: z.number().int().positive().nullable(),
  startRoundId: z.bigint().nullable(),
  endRoundId: z.bigint().nullable(),
  initialBalanceLamports: z.bigint().min(0n),
});

export type SimulationParams = z.infer<typeof simulationParamsSchema>;

export function createSimulationParams(params: {
  roundCount?: number | null;
  startRoundId?: bigint | null;
  endRoundId?: bigint | null;
  initialBalanceSol: number;
}): SimulationParams {
  const LAMPORTS_PER_SOL = 1_000_000_000n;

  if (
    params.startRoundId !== null &&
    params.startRoundId !== undefined &&
    params.endRoundId !== null &&
    params.endRoundId !== undefined
  ) {
    if (params.endRoundId <= params.startRoundId) {
      throw new Error('endRoundId must be greater than startRoundId');
    }
  }

  return {
    roundCount: params.roundCount ?? null,
    startRoundId: params.startRoundId ?? null,
    endRoundId: params.endRoundId ?? null,
    initialBalanceLamports: BigInt(Math.floor(params.initialBalanceSol * Number(LAMPORTS_PER_SOL))),
  };
}
