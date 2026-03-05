import { JupiterPriceAdapter } from '@osb/bot/infrastructure/adapters/price/jupiter-price.adapter';
import { ORE_TOKEN_ADDRESS } from '@osb/bot/infrastructure/constants';
import type { EnvSchema } from '@osb/config/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const env: EnvSchema = {
  WALLET_KEYPAIR: 'BOT_KEYPAIR',
  RPC_HTTP_ENDPOINT: 'http://localhost:8899',
  RPC_WS_ENDPOINT: 'ws://localhost:8900',
  DISCORD_WEBHOOK_URL: undefined,
  JUPITER_API_KEY: 'test-key',
};

describe('JupiterPriceAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns cached quote when not stale', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          [ORE_TOKEN_ADDRESS.toBase58()]: { price: 0.01 },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const adapter = new JupiterPriceAdapter(env);
    const first = await adapter.refresh();
    expect(first).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = await adapter.refresh();
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null when price is invalid', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          [ORE_TOKEN_ADDRESS.toBase58()]: { price: 0 },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const adapter = new JupiterPriceAdapter(env);
    const quote = await adapter.refresh();

    expect(quote).toBeNull();
  });
});
