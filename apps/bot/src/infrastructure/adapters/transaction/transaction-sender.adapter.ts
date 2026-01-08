import type { ConfigSchema } from '@osb/config';
import type {
  Connection,
  Keypair,
  Transaction,
} from '@solana/web3.js';
import type { SendOptions, SendResult } from './types';

export class TransactionSender {
  private readonly connection: Connection;
  private readonly config: ConfigSchema;

  constructor(connection: Connection, config: ConfigSchema) {
    this.connection = connection;
    this.config = config;
  }

  async send(
    transaction: Transaction,
    signers: Keypair[],
    options?: SendOptions
  ): Promise<SendResult> {
    try {
      // Set fee payer from first signer
      const firstSigner = signers[0];
      if (firstSigner) {
        transaction.feePayer = firstSigner.publicKey;
      }

      // Sign with all signers
      for (const signer of signers) {
        transaction.sign(signer);
      }

      // Get or use existing blockhash
      let blockhashInfo: { blockhash: string; lastValidBlockHeight: number };
      if (transaction.recentBlockhash && options?.useCachedBlockhash) {
        // Use the already-set blockhash (from cache)
        // We need to fetch lastValidBlockHeight for confirmation
        const latest = await this.connection.getLatestBlockhash();
        blockhashInfo = {
          blockhash: transaction.recentBlockhash,
          lastValidBlockHeight: latest.lastValidBlockHeight,
        };
      } else {
        // Get fresh blockhash
        blockhashInfo = await this.connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhashInfo.blockhash;
      }

      // Determine confirmation commitment (config default, can be overridden)
      const confirmationCommitment = options?.confirmationCommitment ?? this.config.rpc.commitment;

      // Serialize and send
      const serialized = transaction.serialize({
        requireAllSignatures: true,
        verifySignatures: true,
      });

      const signature = await this.connection.sendRawTransaction(serialized, {
        skipPreflight: this.config.transaction.skipPreflight,
        preflightCommitment: 'confirmed',
        maxRetries: 5,
      });

      // Wait for confirmation with specified commitment
      const confirmation = await this.connection.confirmTransaction(
        {
          signature,
          blockhash: blockhashInfo.blockhash,
          lastValidBlockHeight: blockhashInfo.lastValidBlockHeight,
        },
        confirmationCommitment
      );

      return {
        signature,
        confirmed: !confirmation.value.err,
        error: confirmation.value.err?.toString(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        signature: '',
        confirmed: false,
        error: errorMessage,
      };
    }
  }

  async sendWithRetry(
    transaction: Transaction,
    signers: Keypair[],
    maxRetries: number = 3
  ): Promise<SendResult> {
    let lastError: string | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const result = await this.send(transaction, signers);

      if (result.confirmed) {
        return result;
      }

      if (result.error) {
        lastError = result.error;

        // Check if error is retryable
        if (this.isRetryableError(result.error)) {
          // Wait before retry with exponential backoff
          const delayMs = 2 ** attempt * 100;
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
      }

      // Non-retryable error or max retries reached
      break;
    }

    return {
      signature: '',
      confirmed: false,
      error: lastError ?? 'Max retries exceeded',
    };
  }

  private isRetryableError(error: string): boolean {
    const retryablePatterns = [
      'blockhash not found',
      'already in progress',
      'connection refused',
      'timeout',
      'rate limit',
      'too many requests',
    ];

    return retryablePatterns.some(pattern =>
      error.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  async simulate(transaction: Transaction): Promise<{ success: boolean; error?: string }> {
    try {
      // TypeScript doesn't like Transaction here, but it works at runtime
      const result = await (this.connection.simulateTransaction as any)(transaction, {
        commitment: 'confirmed',
      });

      return {
        success: !result.value.err,
        error: result.value.err?.toString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
