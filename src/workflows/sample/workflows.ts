import {
  proxyActivities,
  defineSignal,
  setHandler,
  defineQuery,
} from '@temporalio/workflow';
import * as workflow from '@temporalio/workflow';

import type * as activities from './activities';
import { WorkflowEntry } from '../registry';

const { sampleActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
});

// Define signals
export const updateNameSignal = defineSignal<[string]>('updateName');
export const status = defineQuery<string>('status');

export interface SampleWorkflow
  extends WorkflowEntry<SampleWorkflowInput, SampleWorkflowOutput> {
  queries: {
    status: typeof status;
  };
}

export interface SampleWorkflowInput {
  name: string;
}

export interface SampleWorkflowOutput {
  name: string;
}

export const sampleWorkflowFunction = async (input: SampleWorkflowInput) => {
  let currentName = input.name;
  let signalReceived = false;

  // Set up signal handler
  setHandler(updateNameSignal, (newName) => {
    workflow.log.info('Received updateName signal', {
      oldName: currentName,
      newName,
    });
    currentName = newName;
    signalReceived = true;
  });

  // Set up condition query handler
  setHandler(status, () =>
    signalReceived
      ? `Name updated to: ${currentName}`
      : `Waiting for signal. Current name: ${currentName}`,
  );

  // Wait for the signal
  workflow.log.info('Waiting for updateName signal...');
  await workflow.condition(() => signalReceived);
  workflow.log.info('Signal received, proceeding with activity');

  const result = await sampleActivity({ name: currentName });
  
  return result;
};

export const sampleWorkflow: SampleWorkflow = {
  workflow: sampleWorkflowFunction,
  taskQueue: 'sample-task-queue',
  queries: {
    status,
  },
};
