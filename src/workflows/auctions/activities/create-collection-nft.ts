import { PublicKey } from '@solana/web3.js';
import { log } from '@temporalio/activity';
import { SolanaService } from '../../../services/solana';

export interface CreateCollectionNFTInput {
  name: string;
  description: string;
  imageUrl: string;
  ownerAddress: string;
  creators: {
    address: string;
    verified: boolean;
    share: number;
  }[];
}

export interface CreateCollectionNFTOutput {
  collectionMint: string;
  transactionHash: string;
  merkleTree: string;
  status: 'success' | 'failed';
  message: string;
}

export async function createCollectionNFT(
  input: CreateCollectionNFTInput,
): Promise<CreateCollectionNFTOutput> {
  try {
    const logData = {
      input: {
        name: input.name,
        ownerAddress: input.ownerAddress,
      },
    };
    log.info('Creating collection NFT', logData);
    const solanaService = SolanaService.getInstance();

    const result = await solanaService.createNft(
      input.name,
      input.description,
      input.imageUrl,
      new PublicKey(input.ownerAddress),
      input.creators.map((creator) => ({
        address: new PublicKey(creator.address),
        verified: creator.verified,
        share: creator.share,
      })),
    );

    return {
      collectionMint: result.collectionMint.toString(),
      transactionHash: result.txId,
      merkleTree: result.merkleTree.toString(),
      status: 'success',
      message: 'Collection NFT created successfully',
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';
    log.error('Error creating collection NFT:', { error: errorMessage });
    return {
      collectionMint: '',
      merkleTree: '',
      transactionHash: '',
      status: 'failed',
      message: errorMessage,
    };
  }
}
