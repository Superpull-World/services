import { PublicKey } from '@solana/web3.js';
import { MPL_TOKEN_METADATA_PROGRAM_ID } from '@metaplex-foundation/mpl-token-metadata';
import {
  MPL_BUBBLEGUM_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from '@metaplex-foundation/mpl-bubblegum';

// Token configuration with mints and their symbols
const TOKEN_CONFIG = {
  '2u7t1UoiYF59GS3dYRQHVdAt9e1uap2WqKqKM7FbWFDv': {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
  },
  '9vRyapDJySweMgsUCXwTNfU3qXcbGPJNn2un1ohv6dVV': {
    symbol: 'SPULL',
    name: 'SuperPull Token',
    decimals: 9,
  },
} as const;

// Default auction mints if not provided in environment
const DEFAULT_AUCTION_MINTS = Object.keys(TOKEN_CONFIG);

// Type for token info
export interface TokenInfo {
  mint: PublicKey;
  symbol: string;
  name: string;
  decimals: number;
}

// Get auction mints from environment or use defaults
const getAuctionMints = (): TokenInfo[] => {
  const envMints =
    process.env.AUCTION_MINT_ADDRESSES?.split(',') || DEFAULT_AUCTION_MINTS;

  return envMints.map((mintStr) => {
    const trimmedMint = mintStr.trim();
    const mint = new PublicKey(trimmedMint);
    const info = TOKEN_CONFIG[trimmedMint as keyof typeof TOKEN_CONFIG] || {
      symbol: `UNKNOWN-${mint.toString().slice(0, 4)}`,
      name: `Unknown Token (${mint.toString().slice(0, 8)})`,
      decimals: 0,
    };

    return {
      mint,
      symbol: info.symbol,
      name: info.name,
      decimals: info.decimals,
    };
  });
};

// Export array of auction mints with their info
export const AUCTION_MINTS = getAuctionMints();

// Re-export program IDs from Metaplex
export const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  MPL_TOKEN_METADATA_PROGRAM_ID,
);
export const BUBBLEGUM_PROGRAM_ID = new PublicKey(MPL_BUBBLEGUM_PROGRAM_ID);
export const COMPRESSION_PROGRAM_ID = new PublicKey(
  'cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK',
);
export const LOG_WRAPPER_PROGRAM_ID = new PublicKey(SPL_NOOP_PROGRAM_ID);
