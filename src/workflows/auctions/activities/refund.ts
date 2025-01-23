import { PublicKey } from '@solana/web3.js';
import { RefundInput, SolanaService } from '../../../services/solana';
import { log } from '@temporalio/activity';

export async function getProofs(collectionMint: string, bidderAddress: string) {
  try {
    const solanaService = SolanaService.getInstance();
    const proofs = await solanaService.getProofs(
      new PublicKey(collectionMint),
      new PublicKey(bidderAddress),
    );
    return proofs;
  } catch (error) {
    log.error('🔍 Error getting proofs:', { error });
    return [];
  }
}

export async function refund(input: RefundInput) {
  const solanaService = SolanaService.getInstance();
  try {
    return await solanaService.refund(input);
  } catch (error) {
    log.error('🔍 Error refunding:', { error });
    return {
      status: 'failed',
      message: `Error refunding ${error}`,
    };
  }
}
