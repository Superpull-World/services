import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { log } from '@temporalio/activity';
import { SuperpullProgram } from '../types/superpull_program';
import IDL from '../idl/superpull_program.json';

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

  constructor(provider: anchor.AnchorProvider) {
    log.debug('Initializing Anchor client', {
      IDL,
    });
    // @ts-expect-error IDL type mismatch
    this.program = new Program(IDL, provider);
  }

  async initializeAuction(
    merkleTree: PublicKey,
    authority: PublicKey,
    basePrice: number,
    priceIncrement: number,
    maxSupply: number,
  ): Promise<{ auctionAddress: PublicKey; signature: string }> {
    log.info('Initializing auction', {
      merkleTree: merkleTree.toString(),
      authority: authority.toString(),
      basePrice,
      priceIncrement,
      maxSupply,
    });

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

    log.info('Auction initialized', {
      auctionAddress: auctionAddress.toString(),
      signature,
    });

    return {
      auctionAddress,
      signature,
    };
  }

  async getCurrentPrice(
    auctionAddress: PublicKey,
  ): Promise<{ price: anchor.BN; supply: anchor.BN }> {
    log.debug('Getting current price', {
      auctionAddress: auctionAddress.toString(),
    });

    await this.program.methods
      .getCurrentPrice()
      .accounts({
        auction: auctionAddress,
      })
      .rpc();

    const state = await this.program.account.auctionState.fetch(auctionAddress);
    const price = state.basePrice.add(
      state.priceIncrement.mul(state.currentSupply),
    );

    log.debug('Current price retrieved', {
      auctionAddress: auctionAddress.toString(),
      price: price.toString(),
      supply: state.currentSupply.toString(),
    });

    return {
      price,
      supply: state.currentSupply,
    };
  }

  async placeBid(
    auction: PublicKey,
    bidder: PublicKey,
    amount: number,
  ): Promise<string> {
    log.info('Placing bid', {
      auction: auction.toString(),
      bidder: bidder.toString(),
      amount,
    });

    const signature = await this.program.methods
      .placeBid(new anchor.BN(amount))
      .accounts({
        auction,
        bidder,
        systemProgram: SystemProgram.programId,
      } as PlaceBidAccounts)
      .rpc();

    log.info('Bid placed', {
      auction: auction.toString(),
      bidder: bidder.toString(),
      amount,
      signature,
    });

    return signature;
  }

  async getAuctionState(auctionAddress: PublicKey) {
    log.debug('Getting auction state', {
      auctionAddress: auctionAddress.toString(),
    });

    const state = await this.program.account.auctionState.fetch(auctionAddress);

    log.debug('Auction state retrieved', {
      auctionAddress: auctionAddress.toString(),
      state: {
        authority: state.authority.toString(),
        merkleTree: state.merkleTree.toString(),
        basePrice: state.basePrice.toString(),
        priceIncrement: state.priceIncrement.toString(),
        maxSupply: state.maxSupply.toString(),
        currentSupply: state.currentSupply.toString(),
      },
    });

    return state;
  }
}
