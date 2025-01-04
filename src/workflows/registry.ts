import { QueryDefinition } from '@temporalio/workflow';
import {
  SampleWorkflowInput,
  SampleWorkflowOutput,
  sampleWorkflow,
} from './sample/workflows';
import { createItemWorkflow, placeBidWorkflow } from './items/workflows';
import type {
  CreateItemInput,
  CreateItemOutput,
  PlaceBidInput,
  PlaceBidOutput,
} from './items/activities';

export interface WorkflowEntry<Input, Output> {
  workflow: (input: Input) => Promise<Output>;
  taskQueue: string;
  queries: Record<string, QueryDefinition<string>>;
}

interface WorkflowRegistry {
  sampleWorkflow: WorkflowEntry<SampleWorkflowInput, SampleWorkflowOutput>;
  createItem: WorkflowEntry<CreateItemInput, CreateItemOutput>;
  placeBid: WorkflowEntry<PlaceBidInput, PlaceBidOutput>;
}

export const workflowRegistry: WorkflowRegistry = {
  sampleWorkflow,
  createItem: createItemWorkflow,
  placeBid: placeBidWorkflow,
};
