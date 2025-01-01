import { proxyActivities } from '@temporalio/workflow';
import * as workflow from '@temporalio/workflow';

import type * as activities from './activities';
import { WorkflowEntry } from '../registry';

const { createNFT } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes', // Increased timeout for blockchain transactions
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
  workflow.setHandler(status, () => 'initiating-nft-creation');
  const result = await createNFT(input);
  workflow.setHandler(status, () => result.status);
  return result;
};

export const createItemWorkflow: CreateItemWorkflow = {
  workflow: createItemWorkflowFunction,
  taskQueue: 'item-task-queue',
  queries: {
    status,
  },
};
