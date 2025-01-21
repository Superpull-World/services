import { PublicKey } from '@solana/web3.js';
import { log } from '@temporalio/activity';
import { SolanaService } from '../../../services/solana';

export interface UpdateCollectionAuthorityInput {
  collectionMint: string;
  authorityAddress: string;
  merkleTree: string;
}

export interface UpdateCollectionAuthorityOutput {
  transactionHash: string;
  status: 'success' | 'failed';
  auctionAddress: string;
  message: string;
}

export async function updateCollectionAuthority(
  input: UpdateCollectionAuthorityInput,
): Promise<UpdateCollectionAuthorityOutput> {
  try {
    const solanaService = SolanaService.getInstance();
    const auctionAddress = await solanaService.findAuctionAddress(
      new PublicKey(input.authorityAddress),
      new PublicKey(input.collectionMint),
    );
    const logData = {
      input: {
        collectionMint: input.collectionMint,
        auctionAddress: auctionAddress.toString(),
      },
    };
    log.info('Updating collection authority', logData);

    const result = await solanaService.updateCollectionAuthority(
      new PublicKey(input.collectionMint),
      new PublicKey(auctionAddress),
      new PublicKey(input.merkleTree),
    );

    return {
      transactionHash: result.txId,
      auctionAddress: auctionAddress.toString(),
      status: 'success',
      message: 'Collection authority updated successfully',
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';
    log.error('Error updating collection authority:', { error: errorMessage });
    return {
      transactionHash: '',
      auctionAddress: '',
      status: 'failed',
      message: errorMessage,
    };
  }
}
