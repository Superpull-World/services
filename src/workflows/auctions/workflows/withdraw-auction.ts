import {
  proxyActivities,
  defineQuery,
  setHandler,
  getExternalWorkflowHandle,
  startChild,
  workflowInfo,
  ParentClosePolicy,
  WorkflowIdReusePolicy,
  defineSignal,
  condition,
} from '@temporalio/workflow';
import { log } from '@temporalio/workflow';
import type { WorkflowEntry } from '../../registry';
import type { AuctionDetails, verifyUserJWT, withdraw } from '../activities';
import { monitorAuctionWorkflowFunction } from './monitor-auction';

// Define the input type for the workflow
export interface WithdrawAuctionInput {
  jwt: string;
  auctionAddress: string;
  authorityAddress: string;
}

// Define the output type for the workflow
export interface WithdrawAuctionOutput {
  status: 'success' | 'failed';
  message?: string;
  signature?: string;
}

const { withdraw: withdrawActivity, verifyUserJWT: verifyJWT } = proxyActivities<{
    withdraw: typeof withdraw;
    verifyUserJWT: typeof verifyUserJWT;
  }>({
    startToCloseTimeout: '1 minute',
  });

export const status = defineQuery<string>('status');

export const monitorUpdate = defineSignal<[AuctionDetails]>('monitorUpdate');

export interface WithdrawAuctionWorkflow
  extends WorkflowEntry<WithdrawAuctionInput, WithdrawAuctionOutput> {
  queries: {
    status: typeof status;
  };
}

export const withdrawAuctionWorkflowFunction = async (
  input: WithdrawAuctionInput,
): Promise<WithdrawAuctionOutput> => {
  log.info('Starting withdraw auction workflow', { input });
  setHandler(status, () => 'verifying-jwt');

  // First verify JWT
  const jwtVerification = await verifyJWT({
    jwt: input.jwt,
    walletAddress: input.authorityAddress,
  });

  if (!jwtVerification.isValid) {
    log.error('JWT verification failed', { jwtVerification });
    setHandler(status, () => 'jwt-verification-failed');
    return {
      status: 'failed',
      message: jwtVerification.message || 'JWT verification failed',
    };
  }

  const info = workflowInfo();
  const parentWorkflowId = info.workflowId;
  let auction: AuctionDetails = {
    address: '',
    collectionMint: '',
    creators: [],
    tokenMint: '',
    name: '',
    description: '',
    imageUrl: '',
    authority: '',
    isGraduated: false,
    currentPrice: 0,
    merkleTree: '',
    basePrice: 0,
    priceIncrement: 0,
    currentSupply: 0,
    maxSupply: 0,
    totalValueLocked: 0,
    minimumItems: 0,
    deadline: 0,
    bids: [],
  };
  setHandler(monitorUpdate, (auctionDetails: AuctionDetails) => {
    auction = auctionDetails;
  });
  const workflowId = `monitor-auction-${input.auctionAddress}`;
  try {
    await startChild(monitorAuctionWorkflowFunction, {
      workflowId,
      args: [
        {
          auctionAddress: input.auctionAddress,
          parentWorkflowId: parentWorkflowId,
        },
      ],
      taskQueue: 'auction',
      workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
      parentClosePolicy: ParentClosePolicy.ABANDON,
    });
  } catch {
    const handle = getExternalWorkflowHandle(workflowId);
    await handle.signal('updateParent', parentWorkflowId);
  }

  await condition(() => auction.tokenMint !== '', '1 minutes');
  if (auction.tokenMint === '') {
    log.error('Auction not found');
    setHandler(status, () => 'auction-not-found');
    return {
      status: 'failed',
      message: 'Auction not found',
    };
  }

  // Perform the withdrawal
  setHandler(status, () => 'withdrawing');
  const withdrawResult = await withdrawActivity(
    auction.address,
    input.authorityAddress,
    auction.collectionMint,
    auction.creators.map((creator) => creator.address),
    auction.tokenMint,
  );

  if (withdrawResult.status === 'failed') {
    log.error('Withdrawal failed', { withdrawResult });
    setHandler(status, () => 'withdrawal-failed');
    return {
      status: 'failed',
      message: withdrawResult.message,
    };
  }

  // Signal monitor auction workflow to refresh
  const monitorAuction = getExternalWorkflowHandle(
    `monitor-auction-${input.auctionAddress}`,
  );
  try {
    await monitorAuction.signal('refreshAuction');
  } catch (error) {
    log.error('Error refreshing auction', { error });
  }

  log.info('Withdrawal completed successfully');
  setHandler(status, () => 'completed');
  return {
    status: 'success',
    message: 'Withdrawal completed successfully',
    signature: withdrawResult.signature,
  };
};
