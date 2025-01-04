import { PublicKey } from '@solana/web3.js';
import { log } from '@temporalio/activity';

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
  minimumItems: number;
}

export interface NFTCreationOutput {
  tokenId: string;
  transactionHash: string;
  status: 'success' | 'failed';
  message: string;
  merkleTree: string;
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

export interface CollectionInitOutput {
  status: 'success' | 'failed';
  message: string;
}

export interface PlaceBidInput {
  auctionAddress: string;
  bidderAddress: string;
  bidAmount: number;
}

export interface PlaceBidOutput {
  transactionHash: string;
  status: 'success' | 'failed';
  message: string;
  bidAmount: number;
}

export async function initializeCollection(): Promise<CollectionInitOutput> {
  try {
    log.info('Initializing collection');
    const solanaService = new SolanaService();
    await solanaService.initializeCollection();

    return {
      status: 'success',
      message: 'Collection initialized successfully',
    };
  } catch (error) {
    log.error('Error in initializeCollection activity:', { error });
    return {
      status: 'failed',
      message:
        error instanceof Error
          ? error.message
          : 'Collection initialization failed',
    };
  }
}

export async function createCompressedNFT(
  input: CreateItemInput,
): Promise<NFTCreationOutput> {
  try {
    log.info('Initializing Solana service', { input });
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

    log.info('Creating compressed NFT', { metadata });
    const result = await solanaService.createCompressedNFT(
      metadata,
      input.ownerAddress,
    );

    return {
      tokenId: result.mint.toBase58(),
      transactionHash: result.txId,
      status: 'success',
      message: `NFT created for ${input.name}`,
      merkleTree: result.merkleTree.toBase58(),
    };
  } catch (error) {
    log.error('Error in createCompressedNFT activity:', { error });
    return {
      tokenId: '',
      transactionHash: '',
      status: 'failed',
      message: error instanceof Error ? error.message : 'NFT creation failed',
      merkleTree: '',
    };
  }
}

export async function listNFTForAuction(
  input: CreateItemInput,
  nftOutput: NFTCreationOutput,
): Promise<AuctionListingOutput> {
  try {
    log.info('Listing NFT for auction', { input, nftOutput });
    const solanaService = new SolanaService();

    const LAMPORTS_PER_SOL = 1_000_000_000; // 1 SOL = 1 billion lamports
    const bondingCurve: BondingCurveParams = {
      initialPrice: input.price * LAMPORTS_PER_SOL,
      slope: Math.floor(input.price * 0.1 * LAMPORTS_PER_SOL), // 10% price increase per token
      minimumPurchase: 1,
      maxSupply: input.maxSupply,
      minimumItems: input.minimumItems,
    };

    const result = await solanaService.initializeAuction(
      nftOutput.tokenId,
      new PublicKey(nftOutput.merkleTree),
      bondingCurve,
      input.ownerAddress,
    );

    return {
      auctionAddress: result.auctionAddress.toString(),
      transactionHash: result.txId,
      status: 'success',
      message: 'NFT listed for auction successfully',
    };
  } catch (error) {
    log.error('Failed to list NFT for auction', { error });
    return {
      auctionAddress: '',
      transactionHash: '',
      status: 'failed',
      message: `Failed to list NFT for auction: ${error}`,
    };
  }
}

export async function placeBid(input: PlaceBidInput): Promise<PlaceBidOutput> {
  try {
    log.info('Placing bid on auction', { input });
    const solanaService = new SolanaService();

    const result = await solanaService.placeBid(
      new PublicKey(input.auctionAddress),
      input.bidderAddress,
      input.bidAmount,
    );

    return {
      transactionHash: result.txId,
      status: 'success',
      message: `Bid placed successfully for ${input.bidAmount} SOL`,
      bidAmount: input.bidAmount,
    };
  } catch (error) {
    log.error('Error in placeBid activity:', { error });
    return {
      transactionHash: '',
      status: 'failed',
      message: error instanceof Error ? error.message : 'Bid placement failed',
      bidAmount: input.bidAmount,
    };
  }
}
