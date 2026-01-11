import { z } from 'zod';

// ============================================================================
// Helpers
// ============================================================================

const optionalUrlSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}, z.url().optional());

// ============================================================================
// ENV SCHEMA (.env file)
// ============================================================================

export const envSchema = z
  .object({
    WALLET_KEYPAIR: z.string().trim().min(1).default('BOT_KEYPAIR'),
    RPC_HTTP_ENDPOINT: z.url().trim(),
    RPC_WS_ENDPOINT: z.url().trim(),
    DISCORD_WEBHOOK_URL: optionalUrlSchema,
    JUPITER_API_KEY: z.string().trim().min(1),
  })
  .strict();

export type EnvSchema = z.infer<typeof envSchema>;
