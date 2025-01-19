import { PublicKey } from '@solana/web3.js';
import { log } from '@temporalio/activity';
import { SolanaService } from '../../../services/solana';

export interface VerifyCollectionInput {
  collectionMint: string;
}

export interface VerifyCollectionOutput {
  transactionHash: string;
  status: 'success' | 'failed';
  message: string;
}

export async function verifyCollection(
  input: VerifyCollectionInput,
): Promise<VerifyCollectionOutput> {
  try {
    const logData = {
      input: {
        collectionMint: input.collectionMint,
      },
    };
    log.info('Verifying collection', logData);
    const solanaService = SolanaService.getInstance();

    const result = await solanaService.verifyCollection(
      new PublicKey(input.collectionMint),
    );

    return {
      transactionHash: result.txId,
      status: 'success',
      message: 'Collection verified successfully',
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';
    log.error('Error verifying collection:', { error: errorMessage });
    return {
      transactionHash: '',
      status: 'failed',
      message: errorMessage,
    };
  }
} 