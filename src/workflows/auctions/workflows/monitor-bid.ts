import {
  proxyActivities,
  defineQuery,
  setHandler,
  getExternalWorkflowHandle,
  defineSignal,
  condition,
  CancellationScope,
} from '@temporalio/workflow';
import type { getBidDetails, BidDetails } from '../activities';
import { WorkflowEntry } from '../../registry';

const { getBidDetails: getBidDetailsActivity } = proxyActivities<{
  getBidDetails: typeof getBidDetails;
}>({
  startToCloseTimeout: '30 seconds',
});

export const status = defineQuery<string>('status');
export const monitorBidResult = defineQuery<BidDetails | null>(
  'monitorBidResult',
);

// Signal to update parent workflow ID
export const updateParent = defineSignal<[string]>('updateParent');
// Signal to trigger immediate refresh
export const refreshBid = defineSignal('refreshBid');

export type MonitorBidInput = {
  auctionAddress: string;
  bidderAddress: string;
  parentWorkflowId: string;
};

export type MonitorBidWorkflow = WorkflowEntry<
  MonitorBidInput,
  BidDetails | null,
  {
    status: string;
    monitorBidResult: BidDetails | null;
  }
>;

export async function monitorBidWorkflowFunction(
  input: MonitorBidInput,
): Promise<BidDetails | null> {
  let result: BidDetails | null = null;
  const parentIds = new Set<string>([input.parentWorkflowId]);
  let shouldRefresh = true;

  setHandler(status, () => 'RUNNING');
  setHandler(monitorBidResult, () => result);

  // Handle parent workflow ID updates
  setHandler(updateParent, async (newParentId: string) => {
    if (!parentIds.has(newParentId)) {
      parentIds.add(newParentId);
      // If we have current data, send it to the new parent
      if (result) {
        const parentHandle = getExternalWorkflowHandle(newParentId);
        try {
          await parentHandle.signal('monitorUpdate', result);
        } catch {
          // If parent workflow no longer exists, remove it from the list
          parentIds.delete(newParentId);
        }
      }
    }
  });

  // Handle refresh requests
  setHandler(refreshBid, () => {
    shouldRefresh = true;
  });

  async function fetchAndNotify() {
    try {
      const bidData = await getBidDetailsActivity({
        auctionAddress: input.auctionAddress,
        bidderAddress: input.bidderAddress,
      });

      // If auction no longer exists, keep last known result
      if (!bidData.bid) {
        return;
      }

      result = bidData.bid;
      // Signal all parent workflows with the update
      for (const parentId of parentIds) {
        const parentHandle = getExternalWorkflowHandle(parentId);
        try {
          await parentHandle.signal('monitorUpdate', bidData.bid);
        } catch {
          // If parent workflow no longer exists, remove it from the list
          parentIds.delete(parentId);
          continue;
        }
      }
      return bidData.bid;
    } catch (error) {
      // Log error but continue monitoring
      console.error('Error fetching bid details:', error);
    }
  }

  try {
    await CancellationScope.cancellable(async () => {
      while (true) {
        if (shouldRefresh) {
          const bid = await fetchAndNotify();
          if (!bid || bid.address === '') {
            break;
          }
          shouldRefresh = false;
        }
        // Wait for either refresh signal or timeout
        await condition(() => shouldRefresh, '1 minutes');
        shouldRefresh = true;
      }
    });
  } catch {
    // On cancellation, send final update to all parents
    if (result) {
      for (const parentId of parentIds) {
        try {
          const parentHandle = getExternalWorkflowHandle(parentId);
          await parentHandle.signal('monitorUpdate', result);
        } catch {
          // Ignore errors when signaling on shutdown
          continue;
        }
      }
    }
  }

  return result;
}

export const monitorBidWorkflow: MonitorBidWorkflow = {
  workflow: monitorBidWorkflowFunction,
  taskQueue: 'auction',
  queries: {
    status,
    monitorBidResult,
  },
};
