import {
  SolanaService,
  NFTMetadata,
  BondingCurveParams,
} from '../../services/solana';

export interface CreateItemInput {
  name: string;
  description: string;
  imageUrl: string;
  price: number;
  ownerAddress: string;
}

export interface CreateItemOutput {
  tokenId: string;
  transactionHash: string;
  status: 'success' | 'failed';
  message: string;
}

export async function createNFT(
  input: CreateItemInput,
): Promise<CreateItemOutput> {
  try {
    const solanaService = new SolanaService();

    const metadata: NFTMetadata = {
      name: input.name,
      symbol: 'SPULL',
      description: input.description,
      image: input.imageUrl,
      attributes: [
        {
          trait_type: 'Price',
          value: input.price,
        },
      ],
    };

    const bondingCurve: BondingCurveParams = {
      initialPrice: input.price,
      slope: 0.1,
      minimumPurchase: 1,
    };

    const result = await solanaService.createNFTWithBondingCurve(
      metadata,
      bondingCurve,
      input.ownerAddress,
    );

    return {
      tokenId: result.mint.toBase58(),
      transactionHash: result.txId,
      status: 'success',
      message: `NFT created for ${input.name}`,
    };
  } catch (error) {
    console.error('Error in createNFT activity:', error);
    return {
      tokenId: '',
      transactionHash: '',
      status: 'failed',
      message: error instanceof Error ? error.message : 'NFT creation failed',
    };
  }
}
