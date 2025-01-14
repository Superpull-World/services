import { PublicKey } from '@solana/web3.js';
import { SolanaService } from '../../../services/solana';
import { AUCTION_MINT } from '../../../config/env';

export interface TokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
}

export interface GetAcceptedTokenMintsOutput {
  tokenMints: TokenMetadata[];
}

export async function getAcceptedTokenMints(): Promise<GetAcceptedTokenMintsOutput> {
  console.log('🔍 Fetching accepted token mints');
  try {
    // For now, we only have one accepted token mint
    const tokenMint = new PublicKey(AUCTION_MINT);
    console.log(`📝 Token mint: ${tokenMint.toBase58()}`);

    // Get token metadata using SolanaService
    const solanaService = new SolanaService();
    const metadata = await solanaService.getTokenMetadata(tokenMint);
    console.log('✅ Token metadata fetched successfully:', metadata);

    return {
      tokenMints: [
        {
          mint: tokenMint.toBase58(),
          ...metadata,
        },
      ],
    };
  } catch (error) {
    console.error('❌ Error fetching token metadata:', error);
    throw error;
  }
}
