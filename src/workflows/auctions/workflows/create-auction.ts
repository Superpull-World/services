import { proxyActivities, defineQuery, setHandler } from '@temporalio/workflow';
import { log } from '@temporalio/workflow';
import type {
  CreateAuctionInput,
  CreateAuctionOutput,
  CreateCollectionNFTInput,
  CreateCollectionNFTOutput,
  VerifyCollectionInput,
  VerifyCollectionOutput,
  UpdateCollectionAuthorityInput,
  UpdateCollectionAuthorityOutput,
  initializeAuction,
  verifyUserJWT,
} from '../activities';
import { WorkflowEntry } from '../../registry';

const {
  createCollectionNFT,
  verifyCollection,
  updateCollectionAuthority,
  initializeAuction: initAuction,
  verifyUserJWT: verifyJWT,
} = proxyActivities<{
  createCollectionNFT: (
    input: CreateCollectionNFTInput,
  ) => Promise<CreateCollectionNFTOutput>;
  verifyCollection: (
    input: VerifyCollectionInput,
  ) => Promise<VerifyCollectionOutput>;
  updateCollectionAuthority: (
    input: UpdateCollectionAuthorityInput,
  ) => Promise<UpdateCollectionAuthorityOutput>;
  initializeAuction: typeof initializeAuction;
  verifyUserJWT: typeof verifyUserJWT;
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

  // Create the collection NFT
  setHandler(status, () => 'creating-collection-nft');
  const nftResult = await createCollectionNFT({
    name: `${input.name} Collection`,
    description: `Collection for ${input.name} auction`,
    ownerAddress: input.ownerAddress,
    creators: input.creators,
  });

  if (nftResult.status === 'failed') {
    log.error('Collection NFT creation failed', { nftResult });
    setHandler(status, () => 'collection-nft-creation-failed');
    return {
      collectionMint: '',
      collectionTransactionHash: nftResult.transactionHash,
      auctionAddress: '',
      auctionTransactionHash: '',
      merkleTree: '',
      tokenMint: '',
      status: 'failed',
      message: nftResult.message,
    };
  }

  // Verify the collection
  setHandler(status, () => 'verifying-collection');
  const verifyResult = await verifyCollection({
    collectionMint: nftResult.collectionMint,
  });

  if (verifyResult.status === 'failed') {
    log.error('Collection verification failed', { verifyResult });
    setHandler(status, () => 'collection-verification-failed');
    return {
      collectionMint: nftResult.collectionMint,
      collectionTransactionHash: nftResult.transactionHash,
      auctionAddress: '',
      auctionTransactionHash: '',
      merkleTree: '',
      tokenMint: '',
      status: 'failed',
      message: verifyResult.message,
    };
  }

  // Update collection authority
  setHandler(status, () => 'updating-collection-authority');
  const authorityResult = await updateCollectionAuthority({
    collectionMint: nftResult.collectionMint,
    authorityAddress: input.ownerAddress,
    merkleTree: nftResult.merkleTree,
  });

  if (authorityResult.status === 'failed') {
    log.error('Collection authority update failed', { authorityResult });
    setHandler(status, () => 'collection-authority-update-failed');
    return {
      collectionMint: nftResult.collectionMint,
      collectionTransactionHash: nftResult.transactionHash,
      auctionAddress: authorityResult.auctionAddress,
      auctionTransactionHash: authorityResult.transactionHash,
      merkleTree: nftResult.merkleTree,
      tokenMint: '',
      status: 'failed',
      message: authorityResult.message,
    };
  }

  // Initialize the auction to get the auction PDA
  setHandler(status, () => 'initializing-auction');
  const auctionResult = await initAuction(
    input,
    authorityResult.auctionAddress,
    nftResult.collectionMint,
    nftResult.merkleTree,
  );

  if (auctionResult.status === 'failed') {
    log.error('Auction initialization failed', { auctionResult });
    setHandler(status, () => 'auction-initialization-failed');
    return {
      collectionMint: nftResult.collectionMint,
      collectionTransactionHash: nftResult.transactionHash,
      auctionAddress: '',
      auctionTransactionHash: '',
      merkleTree: '',
      tokenMint: '',
      status: 'failed',
      message: auctionResult.message,
    };
  }

  log.info('Auction workflow completed successfully');
  setHandler(status, () => 'completed');
  return {
    collectionMint: nftResult.collectionMint,
    collectionTransactionHash: nftResult.transactionHash,
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
  taskQueue: 'auction-task-queue',
  queries: {
    status,
  },
};
