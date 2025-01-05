import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
} from '@temporalio/workflow';
import type * as activities from './activities';
import { WorkflowEntry } from '../registry';

const { generateNonce, verifySignature, generateJWT } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '1 minute',
});

export interface AuthState {
  publicKey: string;
  nonce?: string;
  jwt?: string;
  error?: string;
  signature?: string;
}

// Define signals and queries
export const submitSignature = defineSignal<[string]>('submitSignature');
export const getState = defineQuery<AuthState>('getState');

export interface AuthWorkflow extends WorkflowEntry<string, void, AuthState> {
  queries: {
    getState: typeof getState;
  };
}

export async function auth(publicKey: string): Promise<void> {
  const state: AuthState = {
    publicKey,
  };

  // Generate nonce
  try {
    const nonce = await generateNonce();
    state.nonce = nonce;
  } catch {
    state.error = 'Failed to generate nonce';
    return;
  }

  // Set up query handler for state
  setHandler(getState, () => state);

  // Set up signal handler for signature
  setHandler(submitSignature, (signature: string) => {
    state.signature = signature;
  });

  // Wait for signature to be received
  await condition(() => state.signature !== undefined);

  // Verify signature
  if (!state.nonce || !state.signature) {
    state.error = 'No nonce or signature available';
    return;
  }

  try {
    const isValid = await verifySignature(
      state.nonce,
      state.signature,
      state.publicKey,
    );

    if (isValid) {
      const token = await generateJWT(state.publicKey);
      state.jwt = token;
      state.nonce = undefined; // Clear nonce after successful verification
      state.signature = undefined; // Clear signature after verification
    } else {
      state.error = 'Invalid signature';
    }
  } catch {
    state.error = 'Signature verification failed';
  }
}

export const authWorkflow: AuthWorkflow = {
  workflow: auth,
  taskQueue: 'auth-task-queue',
  queries: {
    getState,
  },
};
