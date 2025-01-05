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
import {
  getAuctionsWorkflow,
  getAuctionDetailsWorkflow,
} from './auctions/workflows';
import type {
  GetAuctionsInput,
  GetAuctionsOutput,
  GetAuctionDetailsInput,
  GetAuctionDetailsOutput,
} from './auctions/activities';

export type QueryResult =
  | string
  | GetAuctionsOutput
  | GetAuctionDetailsOutput
  | AuthState
  | null;

export interface WorkflowEntry<
  Input,
  Output,
  Queries = Record<string, QueryResult>,
> {
  workflow: (input: Input) => Promise<Output>;
  taskQueue: string;
  queries: {
    [K in keyof Queries]: QueryDefinition<Queries[K]>;
  };
}

interface WorkflowRegistry {
  sampleWorkflow: WorkflowEntry<SampleWorkflowInput, SampleWorkflowOutput>;
  createItem: WorkflowEntry<CreateItemInput, CreateItemOutput>;
  placeBid: WorkflowEntry<PlaceBidInput, PlaceBidOutput>;
  auth: WorkflowEntry<string, void, { getState: AuthState }>;
  getAuctions: WorkflowEntry<
    GetAuctionsInput,
    GetAuctionsOutput,
    {
      status: string;
      auctionsResult: GetAuctionsOutput | null;
    }
  >;
  getAuctionDetails: WorkflowEntry<
    GetAuctionDetailsInput,
    GetAuctionDetailsOutput,
    {
      status: string;
      detailsResult: GetAuctionDetailsOutput | null;
    }
  >;
}

export const workflowRegistry: WorkflowRegistry = {
  sampleWorkflow,
  createItem: createItemWorkflow,
  placeBid: placeBidWorkflow,
  auth: authWorkflow,
  getAuctions: getAuctionsWorkflow,
  getAuctionDetails: getAuctionDetailsWorkflow,
};
