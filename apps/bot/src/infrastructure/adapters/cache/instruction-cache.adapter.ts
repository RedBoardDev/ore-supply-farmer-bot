import type { TransactionInstruction } from '@solana/web3.js';

const INSTRUCTION_CACHE_LIMIT = 64;

export interface InstructionCache {
  get(key: string): TransactionInstruction[] | undefined;
  set(key: string, instructions: TransactionInstruction[]): void;
  clear(): void;
  getSize(): number;
}

export class InstructionCacheAdapter implements InstructionCache {
  private cache = new Map<string, TransactionInstruction[]>();

  get(key: string): TransactionInstruction[] | undefined {
    return this.cache.get(key);
  }

  set(key: string, instructions: TransactionInstruction[]): void {
    if (this.cache.size >= INSTRUCTION_CACHE_LIMIT) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, instructions);
  }

  clear(): void {
    this.cache.clear();
  }

  getSize(): number {
    return this.cache.size;
  }
}
