import { log } from '@temporalio/activity';
import { SolanaService } from '../../services/solana';
import { AuctionDetails } from '../../services/types';

export interface GetAuctionsInput {
  merkleTree?: string;
  authority?: string;
  isGraduated?: boolean;
  limit?: number;
  offset?: number;
}

export interface GetAuctionsOutput {
  auctions: AuctionDetails[];
  total: number;
  status: 'success' | 'failed';
  message: string;
}

export interface GetAuctionDetailsInput {
  auctionAddress: string;
}

export interface GetAuctionDetailsOutput {
  auction: AuctionDetails | null;
  status: 'success' | 'failed';
  message: string;
}

export async function getAuctions(
  input: GetAuctionsInput,
): Promise<GetAuctionsOutput> {
  try {
    log.info('Fetching auctions', { input });
    const solanaService = new SolanaService();
    const result = await solanaService.getAuctions({
      merkleTree: input.merkleTree,
      authority: input.authority,
      isGraduated: input.isGraduated,
      limit: input.limit || 10,
      offset: input.offset || 0,
    });

    return {
      auctions: result.auctions,
      total: result.total,
      status: 'success',
      message: 'Successfully fetched auctions',
    };
  } catch (error) {
    log.error('Failed to fetch auctions', { error });
    return {
      auctions: [],
      total: 0,
      status: 'failed',
      message:
        error instanceof Error ? error.message : 'Failed to fetch auctions',
    };
  }
}

export async function getAuctionDetails(
  input: GetAuctionDetailsInput,
): Promise<GetAuctionDetailsOutput> {
  try {
    log.info('Fetching auction details', { input });
    const solanaService = new SolanaService();
    const auction = await solanaService.getAuctionDetails(input.auctionAddress);

    return {
      auction,
      status: 'success',
      message: 'Successfully fetched auction details',
    };
  } catch (error) {
    log.error('Failed to fetch auction details', { error });
    return {
      auction: null,
      status: 'failed',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to fetch auction details',
    };
  }
}
