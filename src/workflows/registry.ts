import { QueryDefinition } from '@temporalio/workflow';
import {
  SampleWorkflowInput,
  SampleWorkflowOutput,
  sampleWorkflow,
} from './sample/workflows';
import { createItemWorkflow } from './items/workflows';
import type { CreateItemInput, CreateItemOutput } from './items/activities';

export interface WorkflowEntry<Input, Output> {
  workflow: (input: Input) => Promise<Output>;
  taskQueue: string;
  queries: Record<string, QueryDefinition<string>>;
}

interface WorkflowRegistry {
  sampleWorkflow: WorkflowEntry<SampleWorkflowInput, SampleWorkflowOutput>;
  createItemWorkflow: WorkflowEntry<CreateItemInput, CreateItemOutput>;
}

export const workflowRegistry: WorkflowRegistry = {
  sampleWorkflow,
  createItemWorkflow,
};
