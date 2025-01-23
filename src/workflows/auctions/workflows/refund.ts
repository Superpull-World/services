import {
  condition,
  defineSignal,
  getExternalWorkflowHandle,
  ParentClosePolicy,
  startChild,
  WorkflowIdReusePolicy,
} from '@temporalio/workflow';

import { AuctionDetails } from '../activities/details';

import {
  defineQuery,
  log,
  proxyActivities,
  setHandler,
  workflowInfo,
} from '@temporalio/workflow';
import { WorkflowEntry } from '../../registry';
import { getProofs, refund, verifyUserJWT } from '../activities';
import { monitorAuctionWorkflowFunction } from './monitor-auction';

export interface RefundInput {
  auctionAddress: string;
  bidderAddress: string;
  jwt: string;
}

export interface RefundOutput {
  status: 'success' | 'failed';
  message?: string;
  signature?: string;
}

const { verifyUserJWT: verifyJWT } = proxyActivities<{
  verifyUserJWT: typeof verifyUserJWT;
}>({
  startToCloseTimeout: '1 minute',
});

const { getProofs: getProofsActivity, refund: refundActivity } =
  proxyActivities<{
    getProofs: typeof getProofs;
    refund: typeof refund;
  }>({
    startToCloseTimeout: '1 minute',
  });

export const status = defineQuery<string>('status');
export const monitorUpdate = defineSignal<[AuctionDetails]>('monitorUpdate');

export interface RefundWorkflow
  extends WorkflowEntry<RefundInput, RefundOutput> {
  queries: {
    status: typeof status;
  };
}

export const refundWorkflowFunction = async (
  input: RefundInput,
): Promise<RefundOutput> => {
  setHandler(status, () => 'verifying-jwt');

  const jwtVerification = await verifyJWT({
    jwt: input.jwt,
    walletAddress: input.bidderAddress,
  });

  if (!jwtVerification.isValid) {
    log.error('JWT verification failed', { jwtVerification });
    setHandler(status, () => 'jwt-verification-failed');
    return {
      status: 'failed',
      message: jwtVerification.message || 'JWT verification failed',
    };
  }

  setHandler(status, () => 'verifying-jwt-success');

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

  setHandler(status, () => 'refunding');
  const proofs = await getProofsActivity(
    auction.collectionMint,
    input.bidderAddress,
  );

  for (const proof of proofs) {
    console.log('🔍 Proof:', proof);
    await refundActivity({
      auctionAddress: input.auctionAddress,
      tokenMint: auction.tokenMint,
      bidderAddress: input.bidderAddress,
      merkleTree: auction.merkleTree,
      proofAccounts: proof.proofAccounts,
      hashes: proof.hashes,
    });
  }

  const monitorAuction = getExternalWorkflowHandle(
    `monitor-auction-${input.auctionAddress}`,
  );
  try {
    await monitorAuction.signal('refreshAuction');
  } catch (error) {
    log.error('Error refreshing auction', { error });
  }

  const monitorBid = getExternalWorkflowHandle(
    `monitor-bid-${input.auctionAddress}-${input.bidderAddress}`,
  );
  try {
    await monitorBid.signal('refreshBid');
  } catch (error) {
    log.error('Error refreshing bid', { error });
  }

  setHandler(status, () => 'completed');

  return { status: 'success' };
};
