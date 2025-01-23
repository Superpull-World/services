import {
  proxyActivities,
  defineQuery,
  setHandler,
  startChild,
  ParentClosePolicy,
  WorkflowIdReusePolicy,
  defineSignal,
  condition,
  workflowInfo,
  getExternalWorkflowHandle,
  log,
} from '@temporalio/workflow';
import type {
  GetAuctionsInput,
  GetAuctionsOutput,
  GetAuctionDetailsInput,
  GetAuctionDetailsOutput,
  getAuctions,
  getAuctionDetails,
  AuctionDetails,
  BidDetails,
} from '../activities';
import { WorkflowEntry } from '../../registry';
import { monitorAuctionWorkflowFunction } from './monitor-auction';
import { monitorBidWorkflowFunction } from './monitor-bid';

const {
  getAuctions: getAuctionsActivity,
  getAuctionDetails: getAuctionDetailsActivity,
} = proxyActivities<{
  getAuctions: typeof getAuctions;
  getAuctionDetails: typeof getAuctionDetails;
}>({
  startToCloseTimeout: '30 seconds',
});

export const status = defineQuery<string>('status');
export const auctionsResult = defineQuery<GetAuctionsOutput | null>(
  'auctionsResult',
);
export const detailsResult = defineQuery<GetAuctionDetailsOutput | null>(
  'detailsResult',
);

// Signal from monitor workflows
export const monitorUpdate = defineSignal<[AuctionDetails]>('monitorUpdate');

export type GetAuctionsWorkflow = WorkflowEntry<
  GetAuctionsInput,
  GetAuctionsOutput,
  {
    status: string;
    auctionsResult: GetAuctionsOutput | null;
  }
>;

export type GetAuctionDetailsWorkflow = WorkflowEntry<
  GetAuctionDetailsInput,
  GetAuctionDetailsOutput,
  {
    status: string;
    detailsResult: GetAuctionDetailsOutput | null;
  }
>;

export async function getAuctionsWorkflowFunction(
  input: GetAuctionsInput,
): Promise<GetAuctionsOutput> {
  let auc_result: GetAuctionsOutput = [];
  setHandler(status, () => 'RUNNING');
  setHandler(auctionsResult, () => auc_result);
  // Get initial list of auctions with pagination
  const initialResult = await getAuctionsActivity();
  auc_result = initialResult;

  // Track monitor updates
  const auctionData = new Map<string, AuctionDetails>();
  const bidData = new Map<string, BidDetails>();
  // Handle updates from monitor workflows
  setHandler(monitorUpdate, (details: AuctionDetails | BidDetails) => {
    log.info('Monitor update received', {
      auctionAddress: details.address,
    });
    if (typeof details === 'object' && 'tokenMint' in details) {
      auctionData.set(details.address, details);
      const auctionsKeys = Array.from(auctionData.keys());
      const auctions = auctionsKeys
        .map((key) => auctionData.get(key))
        .filter((auction) => auction !== undefined)
        .filter((auction) => auction.tokenMint !== undefined)
        .filter((auction) => auction.tokenMint !== '');
      log.info('Monitor update processed', {
        auctions,
      });
      auc_result = auctions;
      // Update query handler to return latest result
      setHandler(auctionsResult, () => auc_result);
    } else if (typeof details === 'object' && 'bidder' in details) {
      bidData.set(details.auction, details);
      const bidsKeys = Array.from(bidData.keys());
      const bids = bidsKeys
        .map((key) => bidData.get(key))
        .filter((bid) => bid !== undefined)
        .filter((bid) => bid.address !== undefined)
        .filter((bid) => bid.address !== '');
      log.info('Monitor update processed', {
        bids,
      });
      auc_result = auc_result.map((auction) => {
        auction.bids = bids.filter((bid) => bid.auction === auction.address);
        return auction;
      });
    }
    // Update result with latest data
  });

  // Get current workflow ID for passing to children
  const info = workflowInfo();
  const parentWorkflowId = info.workflowId;

  // Start or signal monitor workflows for each auction
  await Promise.all(
    initialResult.map(async (auction) => {
      if (auction.address !== undefined) {
        const workflowId = `monitor-auction-${auction.address}`;
        try {
          // Try to start new monitor workflow
          await startChild(monitorAuctionWorkflowFunction, {
            workflowId,
            args: [
              {
                auctionAddress: auction.address,
                parentWorkflowId,
              },
            ],
            taskQueue: 'auction',
            workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
            parentClosePolicy: ParentClosePolicy.ABANDON,
          });
        } catch {
          const handle = getExternalWorkflowHandle(workflowId);
          await handle.signal('updateParent', parentWorkflowId);
        }
      }
    }),
  );

  // Wait briefly for initial monitor data
  await condition(() => auctionData.size >= initialResult.length, '1 minutes');

  await Promise.all(
    auc_result.map(async (auction) => {
      if (auction.address !== undefined) {
        const workflowId = `monitor-bid-${auction.address}-${input.bidderAddress}`;
        try {
          await startChild(monitorBidWorkflowFunction, {
            workflowId,
            args: [
              {
                auctionAddress: auction.address,
                bidderAddress: input.bidderAddress,
                parentWorkflowId,
              },
            ],
            taskQueue: 'auction',
            workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
            parentClosePolicy: ParentClosePolicy.ABANDON,
          });
        } catch {
          const handle = getExternalWorkflowHandle(workflowId);
          await handle.signal('updateParent', parentWorkflowId);
        }
      }
    }),
  );

  log.info('Waiting for initial monitor data', {
    auctionDataSize: auctionData.size,
    initialResultLength: initialResult.length,
    auctionSize: auc_result.length,
  });
  await condition(() => bidData.size >= auc_result.length, '1 minutes');

  setHandler(auctionsResult, () => auc_result);
  setHandler(status, () => 'completed');

  return auc_result;
}

export async function getAuctionDetailsWorkflowFunction(
  input: GetAuctionDetailsInput,
): Promise<GetAuctionDetailsOutput> {
  let result: GetAuctionDetailsOutput | null = null;
  setHandler(status, () => 'RUNNING');
  setHandler(detailsResult, () => result);

  result = await getAuctionDetailsActivity(input);
  return result;
}

export const getAuctionsWorkflow: GetAuctionsWorkflow = {
  workflow: getAuctionsWorkflowFunction,
  taskQueue: 'auction-task-queue',
  queries: {
    status,
    auctionsResult,
  },
};

export const getAuctionDetailsWorkflow: GetAuctionDetailsWorkflow = {
  workflow: getAuctionDetailsWorkflowFunction,
  taskQueue: 'auction-task-queue',
  queries: {
    status,
    detailsResult,
  },
};
