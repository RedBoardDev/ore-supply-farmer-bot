import type { RoundState } from '@osb/bot/domain/types/round';

export function resetRoundState(): RoundState {
  return {
    placedRoundId: null,
    priceRefreshedForRound: null,
    checkpointTriggeredForRound: null,
    roundEndLoggedForRound: null,
    autoTriggerLoggedForRound: null,
  };
}
