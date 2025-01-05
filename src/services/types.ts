import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

export interface AuctionState {
  authority: PublicKey;
  merkleTree: PublicKey;
  basePrice: BN;
  priceIncrement: BN;
  currentSupply: BN;
  maxSupply: BN;
  totalValueLocked: BN;
  minimumItems: BN;
  isGraduated: boolean;
}

export interface AuctionQueryParams {
  merkleTree?: string;
  authority?: string;
  isGraduated?: boolean;
  limit?: number;
  offset?: number;
}

export interface AuctionDetails {
  address: string;
  name: string;
  description: string;
  imageUrl: string;
  authority: string;
  merkleTree: string;
  basePrice: number;
  priceIncrement: number;
  currentSupply: number;
  maxSupply: number;
  totalValueLocked: number;
  minimumItems: number;
  isGraduated: boolean;
  currentPrice: number;
}
