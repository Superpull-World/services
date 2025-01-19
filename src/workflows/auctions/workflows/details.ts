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
} from '../activities';
import { WorkflowEntry } from '../../registry';
import { monitorAuctionWorkflowFunction } from './monitor-auction';

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

export async function getAuctionsWorkflowFunction(): Promise<GetAuctionsOutput> {
  let result: GetAuctionsOutput = [];
  setHandler(status, () => 'RUNNING');
  setHandler(auctionsResult, () => result);

  // Get initial list of auctions with pagination
  const initialResult = await getAuctionsActivity();
  result = initialResult;

  // Track monitor updates
  const monitorData = new Map<string, AuctionDetails>();

  // Handle updates from monitor workflows
  setHandler(monitorUpdate, (details: AuctionDetails) => {
    log.info('Monitor update received', {
      auctionAddress: details.address,
    });
    monitorData.set(details.address, details);
    // Update result with latest data
    const auctionsKeys = Array.from(monitorData.keys());
    const auctions = auctionsKeys
      .map((key) => monitorData.get(key))
      .filter((auction) => auction !== undefined)
      .filter((auction) => auction.tokenMint !== undefined)
      .filter((auction) => auction.tokenMint !== '');
    log.info('Monitor update processed', {
      auctions,
    });
    result = auctions;
    // Update query handler to return latest result
    setHandler(auctionsResult, () => result);
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
  await condition(() => monitorData.size >= initialResult.length, '1 minutes');

  setHandler(status, () => 'completed');

  return result;
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
