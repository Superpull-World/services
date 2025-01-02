import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { SuperpullProgram } from '../types/superpull_program';
import idl from '../idl/superpull_program.json';

interface InitializeAuctionAccounts {
  auction: PublicKey;
  merkleTree: PublicKey;
  authority: PublicKey;
  systemProgram: PublicKey;
}

interface PlaceBidAccounts {
  auction: PublicKey;
  bidder: PublicKey;
  systemProgram: PublicKey;
}

export class AnchorClient {
  program: Program<SuperpullProgram>;

  constructor(provider: anchor.AnchorProvider, programId: PublicKey) {
    // @ts-expect-error IDL type mismatch
    this.program = new Program(idl, programId, provider);
  }

  async initializeAuction(
    merkleTree: PublicKey,
    authority: PublicKey,
    basePrice: number,
    priceIncrement: number,
    maxSupply: number,
  ): Promise<{ auctionAddress: PublicKey; signature: string }> {
    const [auctionAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from('auction'), merkleTree.toBuffer(), authority.toBuffer()],
      this.program.programId,
    );

    const signature = await this.program.methods
      .initializeAuction(
        new anchor.BN(basePrice),
        new anchor.BN(priceIncrement),
        new anchor.BN(maxSupply),
      )
      .accounts({
        auction: auctionAddress,
        merkleTree,
        authority,
        systemProgram: SystemProgram.programId,
      } as InitializeAuctionAccounts)
      .rpc();

    return {
      auctionAddress,
      signature,
    };
  }

  async getCurrentPrice(
    auctionAddress: PublicKey,
  ): Promise<{ price: anchor.BN; supply: anchor.BN }> {
    await this.program.methods
      .getCurrentPrice()
      .accounts({
        auction: auctionAddress,
      })
      .rpc();

    const state = await this.program.account.auctionState.fetch(auctionAddress);
    return {
      price: state.basePrice.add(state.priceIncrement.mul(state.currentSupply)),
      supply: state.currentSupply,
    };
  }

  async placeBid(
    auction: PublicKey,
    bidder: PublicKey,
    amount: number,
  ): Promise<string> {
    const signature = await this.program.methods
      .placeBid(new anchor.BN(amount))
      .accounts({
        auction,
        bidder,
        systemProgram: SystemProgram.programId,
      } as PlaceBidAccounts)
      .rpc();

    return signature;
  }

  async getAuctionState(auctionAddress: PublicKey) {
    return await this.program.account.auctionState.fetch(auctionAddress);
  }
}
