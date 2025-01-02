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
  maxSupply: number;
}

export interface NFTCreationOutput {
  tokenId: string;
  transactionHash: string;
  status: 'success' | 'failed';
  message: string;
}

export interface AuctionListingOutput {
  auctionAddress: string;
  transactionHash: string;
  status: 'success' | 'failed';
  message: string;
}

export interface CreateItemOutput extends NFTCreationOutput {
  auctionAddress: string;
  auctionTransactionHash: string;
}

export async function createCompressedNFT(
  input: CreateItemInput,
): Promise<NFTCreationOutput> {
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

    const result = await solanaService.createCompressedNFT(
      metadata,
      input.ownerAddress,
    );

    return {
      tokenId: result.mint.toBase58(),
      transactionHash: result.txId,
      status: 'success',
      message: `NFT created for ${input.name}`,
    };
  } catch (error) {
    console.error('Error in createCompressedNFT activity:', error);
    return {
      tokenId: '',
      transactionHash: '',
      status: 'failed',
      message: error instanceof Error ? error.message : 'NFT creation failed',
    };
  }
}

export async function listNFTForAuction(
  input: CreateItemInput,
  nftOutput: NFTCreationOutput,
): Promise<AuctionListingOutput> {
  try {
    const solanaService = new SolanaService();

    const bondingCurve: BondingCurveParams = {
      initialPrice: input.price,
      slope: 0.1,
      minimumPurchase: 1,
      maxSupply: input.maxSupply,
    };

    const result = await solanaService.initializeAuction(
      nftOutput.tokenId,
      bondingCurve,
      input.ownerAddress,
    );

    return {
      auctionAddress: result.auctionAddress.toBase58(),
      transactionHash: result.txId,
      status: 'success',
      message: `NFT listed for auction`,
    };
  } catch (error) {
    console.error('Error in listNFTForAuction activity:', error);
    return {
      auctionAddress: '',
      transactionHash: '',
      status: 'failed',
      message:
        error instanceof Error ? error.message : 'Auction listing failed',
    };
  }
}
