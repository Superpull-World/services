import { proxyActivities } from '@temporalio/workflow';
import * as workflow from '@temporalio/workflow';
import { log } from '@temporalio/workflow';

import type * as activities from './activities';
import { WorkflowEntry } from '../registry';

const { createCompressedNFT, listNFTForAuction } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '5 minutes',
});

export const status = workflow.defineQuery<string>('status');

export interface CreateItemWorkflow
  extends WorkflowEntry<
    activities.CreateItemInput,
    activities.CreateItemOutput
  > {
  queries: {
    status: typeof status;
  };
}

export const createItemWorkflowFunction = async (
  input: activities.CreateItemInput,
) => {
  log.info('Creating item workflow', { input });
  workflow.setHandler(status, () => 'creating-compressed-nft');
  const nftResult = await createCompressedNFT(input);

  if (nftResult.status === 'failed') {
    log.error('NFT creation failed', { nftResult });
    workflow.setHandler(status, () => 'nft-creation-failed');
    return {
      ...nftResult,
      auctionAddress: '',
      auctionTransactionHash: '',
    };
  }

  log.info('Listing NFT for auction', { input, nftResult });
  workflow.setHandler(status, () => 'listing-for-auction');
  const auctionResult = await listNFTForAuction(input, nftResult);

  if (auctionResult.status === 'failed') {
    log.error('Auction listing failed', { auctionResult });
    workflow.setHandler(status, () => 'auction-listing-failed');
    return {
      ...nftResult,
      auctionAddress: '',
      auctionTransactionHash: '',
    };
  }

  log.info('Item workflow completed', { auctionResult });
  workflow.setHandler(status, () => 'completed');
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
