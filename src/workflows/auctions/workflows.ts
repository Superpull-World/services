import { proxyActivities, defineQuery, setHandler } from '@temporalio/workflow';
import type {
  GetAuctionsInput,
  GetAuctionsOutput,
  GetAuctionDetailsInput,
  GetAuctionDetailsOutput,
  getAuctions,
  getAuctionDetails,
} from './activities';
import { WorkflowEntry } from '../registry';

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
  let result: GetAuctionsOutput | null = null;
  setHandler(status, () => 'fetching-auctions');
  setHandler(auctionsResult, () => result);

  try {
    result = await getAuctionsActivity(input);
    setHandler(status, () => 'completed');
    return result;
  } catch (error) {
    setHandler(status, () => 'failed');
    throw error;
  }
}

export async function getAuctionDetailsWorkflowFunction(
  input: GetAuctionDetailsInput,
): Promise<GetAuctionDetailsOutput> {
  let result: GetAuctionDetailsOutput | null = null;
  setHandler(status, () => 'fetching-auction-details');
  setHandler(detailsResult, () => result);

  try {
    result = await getAuctionDetailsActivity(input);
    setHandler(status, () => 'completed');
    return result;
  } catch (error) {
    setHandler(status, () => 'failed');
    throw error;
  }
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
