import { log } from '@temporalio/activity';
import { SolanaService } from '../../../services/solana';

export interface AuctionBasicInfo {
  address: string;
  authority: string;
  isGraduated: boolean;
}

export interface GetAuctionsInput {
  limit?: number;
  offset?: number;
}

export type GetAuctionsOutput = Partial<AuctionDetails>[];

export interface GetAuctionDetailsInput {
  auctionAddress: string;
}

export interface GetAuctionDetailsOutput {
  auction: AuctionDetails | null;
}

export interface AuctionDetails {
  address: string;
  name: string;
  description: string;
  imageUrl: string;
  authority: string;
  merkleTree: string;
  tokenMint: string;
  collectionMint: string;
  creators: {
    address: string;
    verified: boolean;
    share: number;
  }[];
  basePrice: number;
  priceIncrement: number;
  currentSupply: number;
  maxSupply: number;
  totalValueLocked: number;
  minimumItems: number;
  deadline: number;
  isGraduated: boolean;
  currentPrice: number;
}

export async function getAuctions(): Promise<GetAuctionsOutput> {
  try {
    const solanaService = SolanaService.getInstance();
    const addresses = await solanaService.getAuctionAddresses();

    return addresses.auctions.map((auction) => ({
      address: auction,
    }));
  } catch (error) {
    log.error('Error in getAuctions activity:', error as Error);
    return [];
  }
}

export async function getAuctionDetails(
  input: GetAuctionDetailsInput,
): Promise<GetAuctionDetailsOutput> {
  try {
    const solanaService = SolanaService.getInstance();
    try {
      const auction = await solanaService.getAuctionDetails(
        input.auctionAddress,
      );
      return {
        auction: {
          address: auction.address,
          name: '', // These would come from metadata
          description: '',
          imageUrl: '',
          authority: auction.state.authority.toString(),
          merkleTree: auction.state.merkleTree.toString(),
          tokenMint: auction.state.tokenMint.toString(),
          collectionMint: auction.state.collectionMint.toString(),
          creators: auction.creators.map((creator) => ({
            address: creator.address.toString(),
            verified: creator.verified,
            share: creator.share,
          })),
          basePrice: auction.state.basePrice.toNumber(),
          priceIncrement: auction.state.priceIncrement.toNumber(),
          currentSupply: auction.state.currentSupply.toNumber(),
          maxSupply: auction.state.maxSupply.toNumber(),
          totalValueLocked: auction.state.totalValueLocked.toNumber(),
          minimumItems: auction.state.minimumItems.toNumber(),
          deadline: auction.state.deadline.toNumber(),
          isGraduated: auction.state.isGraduated,
          currentPrice: 0, // Will be calculated if needed
        },
      };
    } catch (error) {
      // Log specific error but return null for auction
      log.error('Error fetching auction details:', error as Error);
      return {
        auction: {
          address: input.auctionAddress,
          name: '',
          description: '',
          imageUrl: '',
          authority: '',
          merkleTree: '',
          collectionMint: '',
          creators: [],
          tokenMint: '',
          basePrice: 0,
          priceIncrement: 0,
          currentSupply: 0,
          maxSupply: 0,
          totalValueLocked: 0,
          minimumItems: 0,
          deadline: 0,
          isGraduated: false,
          currentPrice: 0,
        },
      };
    }
  } catch (error) {
    // Log service error but continue
    log.error('Error in getAuctionDetails activity:', error as Error);
    return { auction: null };
  }
}
