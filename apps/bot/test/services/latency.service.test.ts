import { LatencyServiceAdapter } from '@osb/bot/domain/services/latency.service';
import { describe, expect, it } from 'vitest';

const DEFAULTS = {
  slotDurationMs: 400,
  smoothing: 0.2,
  initialPrepMs: 400,
  initialExecPerPlacementMs: 160,
  maxSamples: 200,
};

describe('LatencyServiceAdapter', () => {
  it('estimates slots using defaults when no samples exist', () => {
    const service = new LatencyServiceAdapter(DEFAULTS);

    const slots = service.estimateSlots({
      expectedPlacements: 2,
      minSlots: 1,
      maxSlots: 5,
      safetySlots: 1,
      overheadPerPlacementMs: 10,
      parallelismFactor: 1.5,
    });

    expect(slots).toBe(3);
  });

  it('records first sample and exposes snapshot', () => {
    const service = new LatencyServiceAdapter(DEFAULTS);

    service.record(2, 600, 400);

    const snapshot = service.getSnapshot();
    expect(snapshot.prepMs).toBe(600);
    expect(snapshot.execPerPlacementMs).toBe(200);
    expect(snapshot.initialized).toBe(true);
  });
});
