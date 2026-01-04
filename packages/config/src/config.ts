import * as fs from 'node:fs';
import * as path from 'node:path';
import type * as z from 'zod';
import { type ConfigSchema, configSchema } from './schema';

const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), 'config/config.json');

export function loadConfig(configPath: string = DEFAULT_CONFIG_PATH): ConfigSchema {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  const configContent = fs.readFileSync(configPath, 'utf-8');
  const rawConfig = JSON.parse(configContent);

  const result = configSchema.safeParse(rawConfig);

  if (!result.success) {
    const errors = result.error.issues.map((err: z.core.$ZodIssue) => {
      const errPath = err.path.join('.');
      return `  - ${errPath}: ${err.message}`;
    }).join('\n');
    throw new Error(`Configuration validation failed:\n${errors}`);
  }

  return result.data as ConfigSchema;
}

export function validateConfig(config: unknown): config is ConfigSchema {
  const result = configSchema.safeParse(config);
  return result.success;
}
