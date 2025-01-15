import { SolanaService } from '../../../services/solana';
import { AUCTION_MINTS } from '../../../config/env';

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
    const solanaService = new SolanaService();
    const tokenMints: TokenMetadata[] = [];

    // Fetch metadata for all accepted token mints
    for (const tokenInfo of AUCTION_MINTS) {
      console.log(
        `📝 Fetching metadata for token mint: ${tokenInfo.mint.toBase58()}`,
      );
      try {
        const metadata = await solanaService.getTokenMetadata(tokenInfo.mint);
        tokenMints.push({
          mint: tokenInfo.mint.toBase58(),
          name: metadata.name || tokenInfo.name,
          symbol: metadata.symbol || tokenInfo.symbol,
          uri: metadata.uri || '',
          decimals: metadata.decimals,
        });
        console.log('✅ Token metadata fetched successfully');
      } catch (error) {
        console.error(
          `❌ Error fetching metadata for ${tokenInfo.mint.toBase58()}`,
          error,
        );
        // On error, use the stored token info
        tokenMints.push({
          mint: tokenInfo.mint.toBase58(),
          name: tokenInfo.name,
          symbol: tokenInfo.symbol,
          uri: '',
          decimals: 9, // Default to 9 decimals
        });
      }
    }

    if (tokenMints.length === 0) {
      throw new Error('No token metadata could be fetched');
    }

    return { tokenMints };
  } catch (error) {
    console.error('❌ Error fetching token metadata:', error);
    throw error;
  }
}
