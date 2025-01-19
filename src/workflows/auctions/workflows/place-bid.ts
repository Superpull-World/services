import {
  proxyActivities,
  defineQuery,
  setHandler,
  defineSignal,
  condition,
  getExternalWorkflowHandle,
  log,
} from '@temporalio/workflow';
import type {
  PlaceBidInput,
  SubmitSignedBidOutput,
  createBidTransaction,
  submitSignedBid,
} from '../activities';
import { WorkflowEntry } from '../../registry';

const {
  createBidTransaction: createBidTransactionActivity,
  submitSignedBid: submitSignedBidActivity,
} = proxyActivities<{
  createBidTransaction: typeof createBidTransaction;
  submitSignedBid: typeof submitSignedBid;
}>({
  startToCloseTimeout: '1 minute',
});

// Workflow queries
export const status = defineQuery<string>('status');
export const unsignedTransaction = defineQuery<string | null>(
  'unsignedTransaction',
);
export const submissionResult = defineQuery<SubmitSignedBidOutput | null>(
  'submissionResult',
);

// Signal to receive the signed transaction
export const signedTransactionSignal =
  defineSignal<[string]>('signedTransaction');

export type PlaceBidWorkflow = WorkflowEntry<
  PlaceBidInput,
  SubmitSignedBidOutput,
  {
    status: string;
    unsignedTransaction: string | null;
    submissionResult: SubmitSignedBidOutput | null;
  }
>;

export async function placeBidWorkflowFunction(
  input: PlaceBidInput,
): Promise<SubmitSignedBidOutput> {
  let submitResult: SubmitSignedBidOutput | null = null;
  let signedTransaction: string | null = null;
  let signalReceived = false;

  // Set up query handlers
  setHandler(status, () => 'creating-transaction');
  setHandler(unsignedTransaction, () => null);
  setHandler(submissionResult, () => submitResult);

  // Set up signal handler
  setHandler(signedTransactionSignal, (tx: string) => {
    signedTransaction = tx;
    signalReceived = true;
  });

  try {
    // Create the transaction
    const txResult = await createBidTransactionActivity(input);
    if (!txResult.success || !txResult.transaction) {
      setHandler(status, () => 'failed');
      return {
        success: false,
        message: txResult.message || 'Failed to create transaction',
      };
    }

    // Make the unsigned transaction available via query
    setHandler(unsignedTransaction, () => txResult.transaction || null);

    // Wait for the signed transaction
    setHandler(status, () => 'awaiting-signature');
    await condition(() => signalReceived);

    if (!signedTransaction) {
      setHandler(status, () => 'failed');
      return {
        success: false,
        message: 'No signed transaction received',
      };
    }

    // Submit the signed transaction
    setHandler(status, () => 'submitting-transaction');
    submitResult = await submitSignedBidActivity({
      signedTransaction,
    });

    const monitorAuction = getExternalWorkflowHandle(
      `monitor-auction-${input.auctionAddress}`,
    );
    try {
      await monitorAuction.signal('refreshAuction');
    } catch (error) {
      log.error('Error refreshing auction', { error });
    }

    setHandler(status, () => (submitResult?.success ? 'completed' : 'failed'));
    return (
      submitResult || {
        success: false,
        message: 'Failed to submit transaction',
      }
    );
  } catch (error) {
    setHandler(status, () => 'failed');
    return {
      success: false,
      message: (error as Error).message,
    };
  }
}

export const placeBidWorkflow: PlaceBidWorkflow = {
  workflow: placeBidWorkflowFunction,
  taskQueue: 'auction-task-queue',
  queries: {
    status,
    unsignedTransaction,
    submissionResult,
  },
};
