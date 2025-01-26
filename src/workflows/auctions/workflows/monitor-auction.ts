import {
  proxyActivities,
  defineQuery,
  setHandler,
  getExternalWorkflowHandle,
  defineSignal,
  condition,
  CancellationScope,
} from '@temporalio/workflow';
import type { getAuctionDetails, AuctionDetails } from '../activities';
import { WorkflowEntry } from '../../registry';
import { DasApiAsset } from '@metaplex-foundation/digital-asset-standard-api';

const { getAuctionDetails: getAuctionDetailsActivity } = proxyActivities<{
  getAuctionDetails: typeof getAuctionDetails;
}>({
  startToCloseTimeout: '30 seconds',
});

export const status = defineQuery<string>('status');
export const monitorAuctionResult = defineQuery<AuctionDetails | null>(
  'monitorAuctionResult',
);

// Signal to update parent workflow ID
export const updateParent = defineSignal<[string]>('updateParent');
// Signal to trigger immediate refresh
export const refreshAuction = defineSignal('refreshAuction');

export type MonitorAuctionInput = {
  auctionAddress: string;
  parentWorkflowId: string;
  details?: DasApiAsset;
};

export type MonitorAuctionWorkflow = WorkflowEntry<
  MonitorAuctionInput,
  AuctionDetails | null,
  {
    status: string;
    monitorAuctionResult: AuctionDetails | null;
  }
>;

export async function monitorAuctionWorkflowFunction(
  input: MonitorAuctionInput,
): Promise<AuctionDetails | null> {
  let result: AuctionDetails | null = null;
  const parentIds = new Set<string>([input.parentWorkflowId]);
  let shouldRefresh = true;

  setHandler(status, () => 'RUNNING');
  setHandler(monitorAuctionResult, () => result);

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
  setHandler(refreshAuction, () => {
    shouldRefresh = true;
  });

  async function fetchAndNotify() {
    try {
      const auctionData = await getAuctionDetailsActivity({
        auctionAddress: input.auctionAddress,
        details: input.details,
      });

      // If auction no longer exists, keep last known result
      if (!auctionData.auction) {
        return;
      }

      result = auctionData.auction;
      // Signal all parent workflows with the update
      for (const parentId of parentIds) {
        const parentHandle = getExternalWorkflowHandle(parentId);
        try {
          await parentHandle.signal('monitorUpdate', auctionData.auction);
        } catch {
          // If parent workflow no longer exists, remove it from the list
          parentIds.delete(parentId);
          continue;
        }
      }
      return auctionData.auction;
    } catch (error) {
      // Log error but continue monitoring
      console.error('Error fetching auction details:', error);
    }
  }

  try {
    await CancellationScope.cancellable(async () => {
      while (true) {
        if (shouldRefresh) {
          const auction = await fetchAndNotify();
          if (!auction || auction.tokenMint === '') {
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

export const monitorAuctionWorkflow: MonitorAuctionWorkflow = {
  workflow: monitorAuctionWorkflowFunction,
  taskQueue: 'auction',
  queries: {
    status,
    monitorAuctionResult,
  },
};
