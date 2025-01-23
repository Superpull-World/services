import { QueryDefinition } from '@temporalio/workflow';
import { Duration } from '@temporalio/common';
import {
  SampleWorkflowInput,
  SampleWorkflowOutput,
  sampleWorkflowFunction,
} from './sample/workflows';
import { createAuctionWorkflowFunction } from './auctions/workflows/create-auction';
import type {
  CreateAuctionInput,
  CreateAuctionOutput,
} from './auctions/activities/create-auction';
import { auth, AuthState, getState } from './auth/workflows';
import {
  getAuctionsWorkflowFunction,
  getAuctionDetailsWorkflowFunction,
  status as getAuctionsStatus,
  auctionsResult as getAuctionsResult,
  status as getAuctionDetailsStatus,
  detailsResult as getAuctionDetailsResult,
} from './auctions/workflows/get-auctions';
import {
  getAcceptedTokenMintsWorkflowFunction,
  status as getAcceptedTokenMintsStatus,
  tokenMintsResult as getAcceptedTokenMintsResult,
} from './auctions/workflows/token-mints';
import {
  getAllowedCreatorsWorkflowFunction,
  status as getAllowedCreatorsStatus,
  creatorsResult as getAllowedCreatorsResult,
} from './auctions/workflows/allowed-creators';
import {
  type GetAuctionsInput,
  type GetAuctionsOutput,
  type GetAuctionDetailsInput,
  type GetAuctionDetailsOutput,
  type GetAcceptedTokenMintsOutput,
  type GetAcceptedTokenMintsInput,
  type AuctionDetails,
  createAuctionStatus,
  withdrawAuctionStatus,
  monitorBidStatus,
  refundStatus,
} from './auctions';
import {
  placeBidWorkflowFunction,
  status as placeBidStatus,
  unsignedTransaction as placeBidUnsignedTransaction,
  submissionResult as placeBidSubmissionResult,
} from './auctions/workflows/place-bid';
import type {
  BidDetails,
  PlaceBidInput,
  PlaceBidOutput,
  SubmitSignedBidOutput,
} from './auctions';
import type { GetAllowedCreatorsOutput } from './auctions/activities/allowed-creators';
import {
  monitorAuctionWorkflowFunction,
  status as monitorAuctionStatus,
  monitorAuctionResult,
  MonitorAuctionInput,
} from './auctions/workflows/monitor-auction';
import {
  WithdrawAuctionInput,
  WithdrawAuctionOutput,
  withdrawAuctionWorkflowFunction,
} from './auctions/workflows/withdraw-auction';
import {
  MonitorBidInput,
  monitorBidResult,
  monitorBidWorkflowFunction,
} from './auctions/workflows/monitor-bid';
import {
  RefundInput,
  refundWorkflowFunction,
} from './auctions/workflows/refund';
import { RefundOutput } from './auctions/workflows/refund';

export type QueryResult =
  | string
  | GetAuctionsOutput
  | GetAuctionDetailsOutput
  | GetAcceptedTokenMintsOutput
  | GetAllowedCreatorsOutput
  | AuthState
  | SubmitSignedBidOutput
  | null;

export interface WorkflowConfig {
  workflowExecutionTimeout?: Duration;
  workflowRunTimeout?: Duration;
  workflowTaskTimeout?: Duration;
  retryPolicy?: {
    initialInterval?: Duration;
    maximumInterval?: Duration;
    backoffCoefficient?: number;
    maximumAttempts?: number;
  };
}

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
  config?: WorkflowConfig;
}

interface WorkflowRegistry {
  sampleWorkflow: WorkflowEntry<SampleWorkflowInput, SampleWorkflowOutput>;
  createAuction: WorkflowEntry<
    CreateAuctionInput,
    CreateAuctionOutput,
    {
      status: string;
    }
  >;
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
  monitorAuction: WorkflowEntry<
    MonitorAuctionInput,
    AuctionDetails | null,
    {
      status: string;
      auctionResult: AuctionDetails | null;
    }
  >;
  monitorBid: WorkflowEntry<
    MonitorBidInput,
    BidDetails | null,
    {
      status: string;
      bidResult: BidDetails | null;
    }
  >;
  withdrawAuction: WorkflowEntry<
    WithdrawAuctionInput,
    WithdrawAuctionOutput,
    {
      status: string;
    }
  >;
  refund: WorkflowEntry<
    RefundInput,
    RefundOutput,
    {
      status: string;
    }
  >;
}

const defaultConfig: WorkflowConfig = {
  workflowTaskTimeout: '10 seconds',
  retryPolicy: {
    initialInterval: '1 second',
    maximumInterval: '10 seconds',
    backoffCoefficient: 2,
    maximumAttempts: 3,
  },
};

export const workflowRegistry: WorkflowRegistry = {
  sampleWorkflow: {
    workflow: sampleWorkflowFunction,
    taskQueue: 'sample',
    queries: {},
    config: defaultConfig,
  },
  createAuction: {
    workflow: createAuctionWorkflowFunction,
    taskQueue: 'auction',
    queries: {
      status: createAuctionStatus,
    },
    config: {
      ...defaultConfig,
      workflowExecutionTimeout: '5 minutes',
    },
  },
  placeBid: {
    workflow: placeBidWorkflowFunction,
    taskQueue: 'auction',
    queries: {
      status: placeBidStatus,
      unsignedTransaction: placeBidUnsignedTransaction,
      submissionResult: placeBidSubmissionResult,
    },
    config: {
      ...defaultConfig,
      workflowExecutionTimeout: '10 minutes',
    },
  },
  auth: {
    workflow: auth,
    taskQueue: 'auth',
    queries: {
      getState,
    },
    config: {
      ...defaultConfig,
      workflowExecutionTimeout: '24 hours',
    },
  },
  getAuctions: {
    workflow: getAuctionsWorkflowFunction,
    taskQueue: 'auction',
    queries: {
      status: getAuctionsStatus,
      auctionsResult: getAuctionsResult,
    },
    config: {
      ...defaultConfig,
      workflowExecutionTimeout: '1 minute',
    },
  },
  getAuctionDetails: {
    workflow: getAuctionDetailsWorkflowFunction,
    taskQueue: 'auction',
    queries: {
      status: getAuctionDetailsStatus,
      detailsResult: getAuctionDetailsResult,
    },
    config: {
      ...defaultConfig,
      workflowExecutionTimeout: '1 minute',
    },
  },
  getAcceptedTokenMints: {
    workflow: getAcceptedTokenMintsWorkflowFunction,
    taskQueue: 'auction',
    queries: {
      status: getAcceptedTokenMintsStatus,
      tokenMintsResult: getAcceptedTokenMintsResult,
    },
    config: {
      ...defaultConfig,
      workflowExecutionTimeout: '1 minute',
    },
  },
  getAllowedCreators: {
    workflow: getAllowedCreatorsWorkflowFunction,
    taskQueue: 'auction',
    queries: {
      status: getAllowedCreatorsStatus,
      creatorsResult: getAllowedCreatorsResult,
    },
    config: {
      ...defaultConfig,
      workflowExecutionTimeout: '1 minute',
    },
  },
  monitorAuction: {
    workflow: monitorAuctionWorkflowFunction,
    taskQueue: 'auction',
    queries: {
      status: monitorAuctionStatus,
      auctionResult: monitorAuctionResult,
    },
    config: {
      ...defaultConfig,
      workflowExecutionTimeout: '30 minutes',
    },
  },
  monitorBid: {
    workflow: monitorBidWorkflowFunction,
    taskQueue: 'auction',
    queries: {
      status: monitorBidStatus,
      bidResult: monitorBidResult,
    },
    config: {
      ...defaultConfig,
      workflowExecutionTimeout: '30 minutes',
    },
  },
  withdrawAuction: {
    workflow: withdrawAuctionWorkflowFunction,
    taskQueue: 'auction',
    queries: {
      status: withdrawAuctionStatus,
    },
    config: {
      ...defaultConfig,
      workflowExecutionTimeout: '5 minutes',
    },
  },
  refund: {
    workflow: refundWorkflowFunction,
    taskQueue: 'auction',
    queries: {
      status: refundStatus,
    },
  },
};
