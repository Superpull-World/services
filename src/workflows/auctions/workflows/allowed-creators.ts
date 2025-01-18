import { proxyActivities, defineQuery, setHandler } from '@temporalio/workflow';
import type {
  GetAllowedCreatorsOutput,
  getAllowedCreators,
} from '../activities/allowed-creators';
import { WorkflowEntry } from '../../registry';

const { getAllowedCreators: getAllowedCreatorsActivity } = proxyActivities<{
  getAllowedCreators: typeof getAllowedCreators;
}>({
  startToCloseTimeout: '30 seconds',
});

export const status = defineQuery<string>('status');
export const creatorsResult = defineQuery<GetAllowedCreatorsOutput | null>(
  'creatorsResult',
);

export type GetAllowedCreatorsWorkflow = WorkflowEntry<
  void,
  GetAllowedCreatorsOutput,
  {
    status: string;
    creatorsResult: GetAllowedCreatorsOutput | null;
  }
>;

export async function getAllowedCreatorsWorkflowFunction(): Promise<GetAllowedCreatorsOutput> {
  let currentStatus = 'started';
  setHandler(status, () => currentStatus);
  setHandler(creatorsResult, () => null);

  try {
    currentStatus = 'fetching_allowed_creators';
    const result = await getAllowedCreatorsActivity();

    currentStatus = 'completed';
    setHandler(creatorsResult, () => result);
    return result;
  } catch (error: unknown) {
    currentStatus = `failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    throw error;
  }
}

export const getAllowedCreatorsWorkflow: GetAllowedCreatorsWorkflow = {
  workflow: getAllowedCreatorsWorkflowFunction,
  taskQueue: 'auction-task-queue',
  queries: {
    status,
    creatorsResult,
  },
};
