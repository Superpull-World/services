import { QueryDefinition } from '@temporalio/workflow';
import {
  SampleWorkflowInput,
  SampleWorkflowOutput,
  sampleWorkflow,
} from './sample/workflows';
import { createAuctionWorkflow } from './auctions/workflows/create-auction';
import type {
  CreateAuctionInput,
  CreateAuctionOutput,
} from './auctions/activities/create-auction';
import { authWorkflow, AuthState } from './auth/workflows';
import {
  getAuctionsWorkflow,
  getAuctionDetailsWorkflow,
} from './auctions/workflows/details';
import { getAcceptedTokenMintsWorkflow } from './auctions/workflows/token-mints';
import { getAllowedCreatorsWorkflow } from './auctions/workflows/allowed-creators';
import type {
  GetAuctionsInput,
  GetAuctionsOutput,
  GetAuctionDetailsInput,
  GetAuctionDetailsOutput,
  GetAcceptedTokenMintsOutput,
  GetAcceptedTokenMintsInput,
} from './auctions';
import { placeBidWorkflow } from './auctions/workflows/place-bid';
import type {
  PlaceBidInput,
  PlaceBidOutput,
  SubmitSignedBidOutput,
} from './auctions';
import type { GetAllowedCreatorsOutput } from './auctions/activities/allowed-creators';

export type QueryResult =
  | string
  | GetAuctionsOutput
  | GetAuctionDetailsOutput
  | GetAcceptedTokenMintsOutput
  | GetAllowedCreatorsOutput
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
  createAuction: WorkflowEntry<CreateAuctionInput, CreateAuctionOutput>;
  placeBid: WorkflowEntry<
    PlaceBidInput,
    PlaceBidOutput,
    {
      status: string;
      unsignedTransaction: string | null;
      submissionResult: SubmitSignedBidOutput | null;
    }
  >;
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
  getAcceptedTokenMints: WorkflowEntry<
    GetAcceptedTokenMintsInput,
    GetAcceptedTokenMintsOutput,
    {
      status: string;
      tokenMintsResult: GetAcceptedTokenMintsOutput | null;
    }
  >;
  getAllowedCreators: WorkflowEntry<
    void,
    GetAllowedCreatorsOutput,
    {
      status: string;
      creatorsResult: GetAllowedCreatorsOutput | null;
    }
  >;
}

export const workflowRegistry: WorkflowRegistry = {
  sampleWorkflow,
  createAuction: createAuctionWorkflow,
  placeBid: placeBidWorkflow,
  auth: authWorkflow,
  getAuctions: getAuctionsWorkflow,
  getAuctionDetails: getAuctionDetailsWorkflow,
  getAcceptedTokenMints: getAcceptedTokenMintsWorkflow,
  getAllowedCreators: getAllowedCreatorsWorkflow,
};
