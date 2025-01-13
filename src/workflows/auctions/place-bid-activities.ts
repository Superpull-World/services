import { log } from '@temporalio/activity';
import { SolanaService } from '../../services/solana';

export interface PlaceBidInput {
  auctionAddress: string;
  bidderAddress: string;
  bidAmount: number;
}

export interface PlaceBidOutput {
  success: boolean;
  message?: string;
  transaction?: string;
  lastValidBlockHeight?: number;
}

export interface SubmitSignedBidInput {
  signedTransaction: string;
}

export interface SubmitSignedBidOutput {
  success: boolean;
  message?: string;
  signature?: string;
}

export async function createBidTransaction(
  input: PlaceBidInput,
): Promise<PlaceBidOutput> {
  try {
    const solanaService = new SolanaService();
    return await solanaService.createBidTransaction(input);
  } catch (error) {
    log.error('Error in createBidTransaction activity:', error as Error);
    return {
      success: false,
      message: (error as Error).message,
    };
  }
}

export async function submitSignedBid(
  input: SubmitSignedBidInput,
): Promise<SubmitSignedBidOutput> {
  try {
    const solanaService = new SolanaService();
    return await solanaService.submitSignedBidTransaction(
      input.signedTransaction,
    );
  } catch (error) {
    log.error('Error in submitSignedBid activity:', error as Error);
    return {
      success: false,
      message: (error as Error).message,
    };
  }
}
