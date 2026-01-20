import type { ConfigSchema } from '@osb/config';
import type { Connection, Keypair, Transaction } from '@solana/web3.js';
import type { SendOptions, SendResult } from './types';

export class TransactionSender {
  private readonly connection: Connection;
  private readonly config: ConfigSchema;

  constructor(connection: Connection, config: ConfigSchema) {
    this.connection = connection;
    this.config = config;
  }

  async send(transaction: Transaction, signers: Keypair[], options?: SendOptions): Promise<SendResult> {
    try {
      // Set fee payer from first signer
      const firstSigner = signers[0];
      if (firstSigner) {
        transaction.feePayer = firstSigner.publicKey;
      }

      // Sign with all signers
      if (signers.length > 0) {
        transaction.sign(...signers);
      }

      // Get or use existing blockhash
      let blockhashInfo: { blockhash: string; lastValidBlockHeight: number };
      const confirmationCommitment = options?.confirmationCommitment ?? this.config.transaction.confirmationMode;
      const cachedContext = options?.blockhashContext;
      if (
        transaction.recentBlockhash &&
        options?.useCachedBlockhash &&
        cachedContext &&
        cachedContext.blockhash === transaction.recentBlockhash
      ) {
        blockhashInfo = cachedContext;
      } else if (transaction.recentBlockhash && options?.useCachedBlockhash) {
        // Use the already-set blockhash (from cache)
        // We still need lastValidBlockHeight for confirmation
        const latest = await this.connection.getLatestBlockhash(confirmationCommitment);
        blockhashInfo = {
          blockhash: transaction.recentBlockhash,
          lastValidBlockHeight: latest.lastValidBlockHeight,
        };
      } else {
        // Get fresh blockhash
        blockhashInfo = await this.connection.getLatestBlockhash(confirmationCommitment);
        transaction.recentBlockhash = blockhashInfo.blockhash;
      }

      // Serialize and send
      const serialized = transaction.serialize({
        requireAllSignatures: true,
        verifySignatures: true,
      });

      const signature = await this.connection.sendRawTransaction(serialized, {
        skipPreflight: this.config.transaction.skipPreflight,
        preflightCommitment: confirmationCommitment,
        maxRetries: this.config.transaction.maxRetriesMain,
      });

      const awaitConfirmation = options?.awaitConfirmation ?? false;
      const awaitProcessed = options?.awaitProcessed ?? false;

      const confirmationPromise = this.connection.confirmTransaction(
        {
          signature,
          blockhash: blockhashInfo.blockhash,
          lastValidBlockHeight: blockhashInfo.lastValidBlockHeight,
        },
        confirmationCommitment,
      );

      if (awaitConfirmation) {
        const confirmation = await confirmationPromise;
        return {
          signature,
          status: confirmation.value.err ? 'failed' : 'confirmed',
          error: confirmation.value.err?.toString(),
        };
      }

      if (awaitProcessed) {
        const processedPromise =
          confirmationCommitment === 'processed'
            ? confirmationPromise
            : this.connection.confirmTransaction(
                {
                  signature,
                  blockhash: blockhashInfo.blockhash,
                  lastValidBlockHeight: blockhashInfo.lastValidBlockHeight,
                },
                'processed',
              );

        const processed = await processedPromise;
        return {
          signature,
          status: processed.value.err ? 'failed' : 'processed',
          error: processed.value.err?.toString(),
        };
      }

      void confirmationPromise
        .then((result) => {
          if (result.value.err) {
            console.warn(`Transaction ${signature} not confirmed: ${result.value.err?.toString()}`);
          }
        })
        .catch((error) => {
          console.warn(`Transaction ${signature} confirmation failed: ${(error as Error).message}`);
        });

      return {
        signature,
        status: 'submitted',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        signature: '',
        status: 'failed',
        error: errorMessage,
      };
    }
  }

  async sendWithRetry(
    transaction: Transaction,
    signers: Keypair[],
    maxRetries: number = this.config.transaction.maxRetriesDefault,
  ): Promise<SendResult> {
    let lastError: string | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const result = await this.send(transaction, signers);

      if (result.status !== 'failed') {
        return result;
      }

      if (result.error) {
        lastError = result.error;

        // Check if error is retryable
        if (this.isRetryableError(result.error)) {
          // Wait before retry with exponential backoff
          const delayMs = 2 ** attempt * 100;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
      }

      // Non-retryable error or max retries reached
      break;
    }

    return {
      signature: '',
      status: 'failed',
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

    return retryablePatterns.some((pattern) => error.toLowerCase().includes(pattern.toLowerCase()));
  }
}
