import { SolanaService } from '../../../services/solana';
import { AUCTION_MINTS } from '../../../config/env';
import { JWTPayload, verifyJWT } from '../../../services/jwt';
import { PublicKey } from '@solana/web3.js';

export interface TokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  balance?: string;
}

export interface GetAcceptedTokenMintsOutput {
  tokenMints: TokenMetadata[];
}

export interface GetAcceptedTokenMintsInput {
  walletAddress: string;
  jwt: string;
}

export async function validateJwt(
  input: GetAcceptedTokenMintsInput,
): Promise<JWTPayload> {
  console.log('🔐 Validating JWT token');
  try {
    const jwtPayload = await verifyJWT(input.jwt);

    // Verify that the JWT belongs to the wallet address
    if (jwtPayload.publicKey !== input.walletAddress) {
      throw new Error('JWT does not match the provided wallet address');
    }

    return jwtPayload;
  } catch (error) {
    console.error('❌ JWT validation failed:', error);
    throw error;
  }
}

export async function getAcceptedTokenMints(
  input: GetAcceptedTokenMintsInput,
): Promise<GetAcceptedTokenMintsOutput> {
  console.log('🔍 Fetching accepted token mints');
  try {
    const solanaService = SolanaService.getInstance();
    const tokenMints: TokenMetadata[] = [];
    const walletPublicKey = new PublicKey(input.walletAddress);

    // Fetch metadata and balances for all accepted token mints
    for (const tokenInfo of AUCTION_MINTS) {
      console.log(
        `📝 Fetching metadata for token mint: ${tokenInfo.mint.toBase58()}`,
      );
      try {
        const metadata = await solanaService.getTokenMetadata(tokenInfo.mint);
        const balance = await solanaService.getTokenBalance(
          tokenInfo.mint,
          walletPublicKey,
        );

        tokenMints.push({
          mint: tokenInfo.mint.toBase58(),
          name: metadata.name || tokenInfo.name,
          symbol: metadata.symbol || tokenInfo.symbol,
          uri: metadata.uri || '',
          decimals: metadata.decimals,
          balance,
        });
        console.log('✅ Token metadata and balance fetched successfully');
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
          balance: '0',
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
