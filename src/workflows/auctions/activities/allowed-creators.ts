import { PublicKey } from '@solana/web3.js';

export interface GetAllowedCreatorsOutput {
  creators: PublicKey[];
}

export async function getAllowedCreators(): Promise<GetAllowedCreatorsOutput> {
  const allowedCreatorsStr = process.env.ALLOWED_AUCTION_CREATORS || '';
  const creatorAddresses = allowedCreatorsStr
    .split(',')
    .filter((addr) => addr.trim() !== '');
  
  return {
    creators: creatorAddresses.map((addr) => new PublicKey(addr.trim())),
  };
} 