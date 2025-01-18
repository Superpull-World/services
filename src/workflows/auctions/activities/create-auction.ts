import { PublicKey } from '@solana/web3.js';
import { log } from '@temporalio/activity';

import { SolanaService } from '../../../services/solana';
import { JWTPayload, verifyJWT } from '../../../services/jwt';

export interface CreateAuctionInput {
  name: string;
  description: string;
  imageUrl: string;
  price: number;
  ownerAddress: string;
  maxSupply: number;
  minimumItems: number;
  jwt: string;
  deadline: number; // Unix timestamp in seconds
  tokenMint: string;
}

export interface AuctionCollectionOutput {
  collectionMint: string;
  transactionHash: string;
  status: 'success' | 'failed';
  message: string;
}

export interface AuctionInitOutput {
  auctionAddress: string;
  transactionHash: string;
  status: 'success' | 'failed';
  message: string;
  merkleTree: string;
}

export interface CreateAuctionOutput {
  collectionMint: string;
  collectionTransactionHash: string;
  auctionAddress: string;
  auctionTransactionHash: string;
  merkleTree: string;
  tokenMint: string;
  status: 'success' | 'failed';
  message: string;
}

export interface JWTVerificationInput {
  jwt: string;
  walletAddress: string;
}

export interface JWTVerificationOutput {
  isValid: boolean;
  message?: string;
  payload?: JWTPayload;
}

export async function verifyUserJWT(
  input: JWTVerificationInput,
): Promise<JWTVerificationOutput> {
  try {
    const jwtPayload = await verifyJWT(input.jwt);
    if (jwtPayload.publicKey !== input.walletAddress) {
      return {
        isValid: false,
        message: 'JWT public key does not match wallet address',
      };
    }
    return {
      isValid: true,
      payload: jwtPayload,
    };
  } catch (error) {
    return {
      isValid: false,
      message:
        error instanceof Error ? error.message : 'JWT verification failed',
    };
  }
}

export async function createAuctionCollection(
  input: CreateAuctionInput,
): Promise<AuctionCollectionOutput> {
  try {
    const logData = {
      input: {
        name: input.name,
        ownerAddress: input.ownerAddress,
      },
    };
    log.info('Creating auction collection', logData);
    const solanaService = new SolanaService();

    const result = await solanaService.createAuctionCollection(
      `${input.name} Collection`,
      `Collection for ${input.name} auction`,
      new PublicKey(input.ownerAddress),
    );

    return {
      collectionMint: result.collectionMint.toString(),
      transactionHash: result.txId,
      status: 'success',
      message: 'Auction collection created successfully',
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';
    log.error('Error creating auction collection:', { error: errorMessage });
    return {
      collectionMint: '',
      transactionHash: '',
      status: 'failed',
      message: errorMessage,
    };
  }
}

export async function initializeAuction(
  input: CreateAuctionInput,
  collectionMint: string,
): Promise<AuctionInitOutput> {
  try {
    const logData = {
      input: {
        name: input.name,
        ownerAddress: input.ownerAddress,
      },
    };
    log.info('Initializing auction', logData);
    const solanaService = new SolanaService();

    // Create merkle tree for the auction
    const merkleTree = await solanaService.createMerkleTree();

    // Initialize the auction with the merkle tree
    const result = await solanaService.initializeAuction(
      merkleTree,
      new PublicKey(input.ownerAddress),
      new PublicKey(collectionMint),
      input.price,
      0.1,
      input.maxSupply,
      input.minimumItems,
      input.deadline,
      new PublicKey(input.tokenMint),
    );

    return {
      auctionAddress: result.auctionAddress.toString(),
      transactionHash: result.txId,
      status: 'success',
      message: 'Auction initialized successfully',
      merkleTree: merkleTree.toString(),
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';
    log.error('Error initializing auction:', { error: errorMessage });
    return {
      auctionAddress: '',
      transactionHash: '',
      status: 'failed',
      message: errorMessage,
      merkleTree: '',
    };
  }
}
