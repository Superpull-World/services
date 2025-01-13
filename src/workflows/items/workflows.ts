import { proxyActivities, defineQuery, setHandler } from '@temporalio/workflow';
import { log } from '@temporalio/workflow';
import type {
  CreateAuctionInput,
  CreateAuctionOutput,
  createAuctionCollection,
  initializeAuction,
  verifyUserJWT,
  PlaceBidInput,
  PlaceBidOutput,
  placeBid,
} from './activities';
import { WorkflowEntry } from '../registry';

const {
  createAuctionCollection: createCollection,
  initializeAuction: initAuction,
  verifyUserJWT: verifyJWT,
  placeBid: placeBidActivity,
} = proxyActivities<{
  createAuctionCollection: typeof createAuctionCollection;
  initializeAuction: typeof initializeAuction;
  verifyUserJWT: typeof verifyUserJWT;
  placeBid: typeof placeBid;
}>({
  startToCloseTimeout: '1 minute',
});

export const status = defineQuery<string>('status');

export interface CreateAuctionWorkflow
  extends WorkflowEntry<CreateAuctionInput, CreateAuctionOutput> {
  queries: {
    status: typeof status;
  };
}

export interface PlaceBidWorkflow
  extends WorkflowEntry<PlaceBidInput, PlaceBidOutput> {
  queries: {
    status: typeof status;
  };
}

export const createAuctionWorkflowFunction = async (
  input: CreateAuctionInput,
): Promise<CreateAuctionOutput> => {
  log.info('Starting auction workflow', { input });
  setHandler(status, () => 'verifying-jwt');

  // First verify JWT
  const jwtVerification = await verifyJWT({
    jwt: input.jwt,
    walletAddress: input.ownerAddress,
  });

  if (!jwtVerification.isValid) {
    log.error('JWT verification failed', { jwtVerification });
    setHandler(status, () => 'jwt-verification-failed');
    return {
      collectionMint: '',
      collectionTransactionHash: '',
      auctionAddress: '',
      auctionTransactionHash: '',
      merkleTree: '',
      tokenMint: '',
      status: 'failed',
      message: jwtVerification.message || 'JWT verification failed',
    };
  }

  // Create the auction collection
  setHandler(status, () => 'creating-auction-collection');
  const collectionResult = await createCollection(input);
  if (collectionResult.status === 'failed') {
    log.error('Auction collection creation failed', { collectionResult });
    setHandler(status, () => 'collection-creation-failed');
    return {
      collectionMint: '',
      collectionTransactionHash: collectionResult.transactionHash,
      auctionAddress: '',
      auctionTransactionHash: '',
      merkleTree: '',
      tokenMint: '',
      status: 'failed',
      message: collectionResult.message,
    };
  }

  // Initialize the auction
  setHandler(status, () => 'initializing-auction');
  const auctionResult = await initAuction(
    input,
    collectionResult.collectionMint,
  );
  if (auctionResult.status === 'failed') {
    log.error('Auction initialization failed', { auctionResult });
    setHandler(status, () => 'auction-initialization-failed');
    return {
      collectionMint: collectionResult.collectionMint,
      collectionTransactionHash: collectionResult.transactionHash,
      auctionAddress: '',
      auctionTransactionHash: '',
      merkleTree: '',
      tokenMint: '',
      status: 'failed',
      message: auctionResult.message,
    };
  }

  log.info('Item workflow completed successfully');
  setHandler(status, () => 'completed');
  return {
    collectionMint: collectionResult.collectionMint,
    collectionTransactionHash: collectionResult.transactionHash,
    auctionAddress: auctionResult.auctionAddress,
    auctionTransactionHash: auctionResult.transactionHash,
    merkleTree: auctionResult.merkleTree,
    tokenMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC token mint
    status: 'success',
    message: 'Auction initialized successfully',
  };
};

export const createAuctionWorkflow: CreateAuctionWorkflow = {
  workflow: createAuctionWorkflowFunction,
  taskQueue: 'item-task-queue',
  queries: {
    status,
  },
};

export const placeBidWorkflowFunction = async (
  input: PlaceBidInput,
): Promise<PlaceBidOutput> => {
  log.info('Starting bid workflow', { input });
  setHandler(status, () => 'verifying-jwt');

  // First verify JWT
  const jwtVerification = await verifyJWT({
    jwt: input.jwt,
    walletAddress: input.bidderAddress,
  });

  if (!jwtVerification.isValid) {
    log.error('JWT verification failed', { jwtVerification });
    setHandler(status, () => 'jwt-verification-failed');
    return {
      transactionHash: '',
      status: 'failed',
      message: jwtVerification.message || 'JWT verification failed',
      bidAmount: input.bidAmount,
    };
  }

  setHandler(status, () => 'placing-bid');
  return await placeBidActivity(input);
};

export const placeBidWorkflow: PlaceBidWorkflow = {
  workflow: placeBidWorkflowFunction,
  taskQueue: 'item-task-queue',
  queries: {
    status,
  },
};
