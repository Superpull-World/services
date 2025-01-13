import { log } from '@temporalio/activity';
import { SolanaService } from '../../services/solana';

export interface GetAuctionsInput {
  authority?: string;
  isGraduated?: boolean;
  limit?: number;
  offset?: number;
}

export interface GetAuctionsOutput {
  auctions: AuctionDetails[];
  total: number;
}

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

export async function getAuctions(
  input: GetAuctionsInput,
): Promise<GetAuctionsOutput> {
  try {
    const solanaService = new SolanaService();
    const result = await solanaService.getAuctions({
      authority: input.authority,
      isGraduated: input.isGraduated,
      limit: input.limit || 10, // Default limit to 10
      offset: input.offset || 0,
    });

    const auctions = result.auctions.map((auction) => ({
      address: auction.address,
      name: '', // These would come from metadata
      description: '',
      imageUrl: '',
      authority: auction.state.authority.toString(),
      merkleTree: auction.state.merkleTree.toString(),
      tokenMint: auction.state.tokenMint.toString(),
      collectionMint: auction.state.collectionMint.toString(),
      basePrice: auction.state.basePrice.toNumber(),
      priceIncrement: auction.state.priceIncrement.toNumber(),
      currentSupply: auction.state.currentSupply.toNumber(),
      maxSupply: auction.state.maxSupply.toNumber(),
      totalValueLocked: auction.state.totalValueLocked.toNumber(),
      minimumItems: auction.state.minimumItems.toNumber(),
      deadline: auction.state.deadline.toNumber(),
      isGraduated: auction.state.isGraduated,
      currentPrice: 0, // Will be calculated separately if needed
    }));

    return {
      auctions,
      total: result.total,
    };
  } catch (error) {
    log.error('Error in getAuctions activity:', error as Error);
    return {
      auctions: [],
      total: 0,
    };
  }
}

export async function getAuctionDetails(
  input: GetAuctionDetailsInput,
): Promise<GetAuctionDetailsOutput> {
  try {
    const solanaService = new SolanaService();
    const auction = await solanaService.getAuctionDetails(input.auctionAddress);

    return {
      auction: {
        address: auction.address,
        name: '', // These would come from metadata
        description: '',
        imageUrl: '',
        authority: auction.state.authority.toString(),
        merkleTree: auction.state.merkleTree.toString(),
        tokenMint: auction.state.tokenMint.toString(),
        basePrice: auction.state.basePrice.toNumber(),
        priceIncrement: auction.state.priceIncrement.toNumber(),
        currentSupply: auction.state.currentSupply.toNumber(),
        maxSupply: auction.state.maxSupply.toNumber(),
        totalValueLocked: auction.state.totalValueLocked.toNumber(),
        minimumItems: auction.state.minimumItems.toNumber(),
        deadline: auction.state.deadline.toNumber(),
        isGraduated: auction.state.isGraduated,
        currentPrice: auction.currentPrice,
      },
    };
  } catch (error) {
    log.error('Error in getAuctionDetails activity:', error as Error);
    return {
      auction: null,
    };
  }
}
