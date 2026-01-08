export interface PlacementResult {
  success: boolean;
  squareIndex: number;
  amountLamports: bigint;
  signature?: string;
  error?: string;
}