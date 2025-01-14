import { PublicKey } from '@solana/web3.js';
import { MPL_TOKEN_METADATA_PROGRAM_ID } from '@metaplex-foundation/mpl-token-metadata';
import {
  MPL_BUBBLEGUM_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from '@metaplex-foundation/mpl-bubblegum';

// USDC mint address on mainnet
export const AUCTION_MINT = new PublicKey(
  process.env.AUCTION_MINT_ADDRESS ||
    '2u7t1UoiYF59GS3dYRQHVdAt9e1uap2WqKqKM7FbWFDv',
);

// Re-export program IDs from Metaplex
export const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  MPL_TOKEN_METADATA_PROGRAM_ID,
);
export const BUBBLEGUM_PROGRAM_ID = new PublicKey(MPL_BUBBLEGUM_PROGRAM_ID);
export const COMPRESSION_PROGRAM_ID = new PublicKey(
  'cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK',
);
export const LOG_WRAPPER_PROGRAM_ID = new PublicKey(SPL_NOOP_PROGRAM_ID);
