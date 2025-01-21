import { PublicKey } from '@solana/web3.js';
import { SolanaService } from '../../../services/solana';
import type { WithdrawAuctionOutput } from '../workflows/withdraw-auction';
import { log } from '@temporalio/activity';

export async function withdraw(
  auctionAddress: string,
  authorityAddress: string,
  collectionMint: string,
  creators: string[],
  tokenMint: string,
): Promise<WithdrawAuctionOutput> {
  const solanaService = SolanaService.getInstance();
  log.info('Withdrawing auction', {
    auctionAddress,
    authorityAddress,
    collectionMint,
    creators,
    tokenMint,
  });

  try {
    const result = await solanaService.withdraw(
      new PublicKey(auctionAddress),
      new PublicKey(authorityAddress),
      new PublicKey(collectionMint),
      creators.map((creator) => new PublicKey(creator)),
      new PublicKey(tokenMint),
    );

    log.info('Withdrawal result', {
      success: result.success,
      message: result.message,
      signature: result.signature,
    });

    return {
      status: result.success ? 'success' : 'failed',
      message: result.message,
      signature: result.signature,
    };
  } catch (error) {
    log.error('Error in withdraw activity', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      status: 'failed',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
