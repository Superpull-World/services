import { proxyActivities, defineQuery, setHandler } from '@temporalio/workflow';
import type {
  GetAcceptedTokenMintsOutput,
  GetAcceptedTokenMintsInput,
  getAcceptedTokenMints,
  validateJwt,
} from '../activities';
import { WorkflowEntry } from '../../registry';

const {
  getAcceptedTokenMints: getAcceptedTokenMintsActivity,
  validateJwt: validateJwtActivity,
} = proxyActivities<{
  getAcceptedTokenMints: typeof getAcceptedTokenMints;
  validateJwt: typeof validateJwt;
}>({
  startToCloseTimeout: '30 seconds',
});

export const status = defineQuery<string>('status');
export const tokenMintsResult = defineQuery<GetAcceptedTokenMintsOutput | null>(
  'tokenMintsResult',
);

export type GetAcceptedTokenMintsWorkflow = WorkflowEntry<
  GetAcceptedTokenMintsInput,
  GetAcceptedTokenMintsOutput,
  {
    status: string;
    tokenMintsResult: GetAcceptedTokenMintsOutput | null;
  }
>;

export async function getAcceptedTokenMintsWorkflowFunction(
  input: GetAcceptedTokenMintsInput,
): Promise<GetAcceptedTokenMintsOutput> {
  let currentStatus = 'started';
  setHandler(status, () => currentStatus);
  setHandler(tokenMintsResult, () => null);

  try {
    currentStatus = 'validating_jwt';
    await validateJwtActivity(input);

    currentStatus = 'fetching_token_mints';
    const result = await getAcceptedTokenMintsActivity(input);

    currentStatus = 'completed';
    setHandler(tokenMintsResult, () => result);
    return result;
  } catch (error: unknown) {
    currentStatus = `failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
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
