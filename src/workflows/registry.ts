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
import { authWorkflow, AuthState } from './auth/workflows';

export interface WorkflowEntry<Input, Output, QueryResult = string> {
  workflow: (input: Input) => Promise<Output>;
  taskQueue: string;
  queries: Record<string, QueryDefinition<QueryResult>>;
}

interface WorkflowRegistry {
  sampleWorkflow: WorkflowEntry<SampleWorkflowInput, SampleWorkflowOutput>;
  createItem: WorkflowEntry<CreateItemInput, CreateItemOutput>;
  placeBid: WorkflowEntry<PlaceBidInput, PlaceBidOutput>;
  auth: WorkflowEntry<string, void, AuthState>;
}

export const workflowRegistry: WorkflowRegistry = {
  sampleWorkflow,
  createItem: createItemWorkflow,
  placeBid: placeBidWorkflow,
  auth: authWorkflow,
};
