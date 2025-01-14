import { proxyActivities, defineQuery, setHandler } from '@temporalio/workflow';
import type {
  GetAcceptedTokenMintsOutput,
  getAcceptedTokenMints,
} from '../activities';
import { WorkflowEntry } from '../../registry';

const { getAcceptedTokenMints: getAcceptedTokenMintsActivity } =
  proxyActivities<{
    getAcceptedTokenMints: typeof getAcceptedTokenMints;
  }>({
    startToCloseTimeout: '30 seconds',
  });

export const status = defineQuery<string>('status');
export const tokenMintsResult = defineQuery<GetAcceptedTokenMintsOutput | null>(
  'tokenMintsResult',
);

export type GetAcceptedTokenMintsWorkflow = WorkflowEntry<
  void,
  GetAcceptedTokenMintsOutput,
  {
    status: string;
    tokenMintsResult: GetAcceptedTokenMintsOutput | null;
  }
>;

export async function getAcceptedTokenMintsWorkflowFunction(): Promise<GetAcceptedTokenMintsOutput> {
  let currentStatus = 'STARTED';
  setHandler(status, () => currentStatus);
  setHandler(tokenMintsResult, () => null);

  try {
    currentStatus = 'FETCHING_TOKEN_MINTS';
    const result = await getAcceptedTokenMintsActivity();

    currentStatus = 'COMPLETED';
    setHandler(tokenMintsResult, () => result);
    return result;
  } catch (error: unknown) {
    currentStatus = `FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`;
    throw error;
  }
}

export const getAcceptedTokenMintsWorkflow: GetAcceptedTokenMintsWorkflow = {
  workflow: getAcceptedTokenMintsWorkflowFunction,
  taskQueue: 'auction-task-queue',
  queries: {
    status,
    tokenMintsResult,
  },
};
