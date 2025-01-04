import { proxyActivities, defineQuery, setHandler } from '@temporalio/workflow';
import { log } from '@temporalio/workflow';
import type {
  CreateItemInput,
  CreateItemOutput,
  createCompressedNFT,
  listNFTForAuction,
  initializeCollection,
} from './activities';
import { WorkflowEntry } from '../registry';

const {
  createCompressedNFT: createNFT,
  listNFTForAuction: listAuction,
  initializeCollection: initCollection,
} = proxyActivities<{
  createCompressedNFT: typeof createCompressedNFT;
  listNFTForAuction: typeof listNFTForAuction;
  initializeCollection: typeof initializeCollection;
}>({
  startToCloseTimeout: '1 minute',
});

export const status = defineQuery<string>('status');

export interface CreateItemWorkflow
  extends WorkflowEntry<CreateItemInput, CreateItemOutput> {
  queries: {
    status: typeof status;
  };
}

export const createItemWorkflowFunction = async (
  input: CreateItemInput,
): Promise<CreateItemOutput> => {
  log.info('Starting item workflow', { input });
  setHandler(status, () => 'initializing-collection');

  // First initialize the collection
  const collectionResult = await initCollection();
  if (collectionResult.status === 'failed') {
    log.error('Collection initialization failed', { collectionResult });
    setHandler(status, () => 'collection-init-failed');
    return {
      tokenId: '',
      transactionHash: '',
      status: 'failed',
      message: `Collection initialization failed: ${collectionResult.message}`,
      merkleTree: '',
      auctionAddress: '',
      auctionTransactionHash: '',
    };
  }

  // Create the NFT
  setHandler(status, () => 'creating-compressed-nft');
  const nftResult = await createNFT(input);
  if (nftResult.status === 'failed') {
    log.error('NFT creation failed', { nftResult });
    setHandler(status, () => 'nft-creation-failed');
    return {
      ...nftResult,
      auctionAddress: '',
      auctionTransactionHash: '',
    };
  }

  // List the NFT for auction
  log.info('Listing NFT for auction', { input, nftResult });
  setHandler(status, () => 'listing-for-auction');
  const auctionResult = await listAuction(input, nftResult);

  if (auctionResult.status === 'failed') {
    log.error('Auction listing failed', { auctionResult });
    setHandler(status, () => 'auction-listing-failed');
    return {
      ...nftResult,
      auctionAddress: auctionResult.auctionAddress,
      auctionTransactionHash: auctionResult.transactionHash,
    };
  }

  log.info('Item workflow completed successfully');
  setHandler(status, () => 'completed');
  return {
    ...nftResult,
    auctionAddress: auctionResult.auctionAddress,
    auctionTransactionHash: auctionResult.transactionHash,
  };
};

export const createItemWorkflow: CreateItemWorkflow = {
  workflow: createItemWorkflowFunction,
  taskQueue: 'item-task-queue',
  queries: {
    status,
  },
};
