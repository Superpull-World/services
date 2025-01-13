import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { log } from '@temporalio/activity';
import { SuperpullProgram } from '../types/superpull_program';
import IDL from '../idl/superpull_program.json';

interface InitializeAuctionAccounts {
  auction: PublicKey;
  merkleTree: PublicKey;
  collectionMint: PublicKey;
  tokenMint: PublicKey;
  authority: PublicKey;
  bubblegumProgram: PublicKey;
  systemProgram: PublicKey;
}

interface PlaceBidAccounts {
  auction: PublicKey;
  bid: PublicKey;
  bidder: PublicKey;
  merkleTree: PublicKey;
  treeConfig: PublicKey;
  treeCreator: PublicKey;
  collectionMint: PublicKey;
  tokenMint: PublicKey;
  bidderTokenAccount: PublicKey;
  auctionTokenAccount: PublicKey;
  authority: PublicKey;
  collectionMetadata: PublicKey;
  collectionEdition: PublicKey;
  collectionAuthorityRecordPda: PublicKey;
  bubblegumProgram: PublicKey;
  tokenMetadataProgram: PublicKey;
  compressionProgram: PublicKey;
  logWrapper: PublicKey;
  tokenProgram: PublicKey;
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
    collectionMint: PublicKey,
    authority: PublicKey,
    basePrice: number,
    priceIncrement: number,
    maxSupply: number,
    minimumItems: number,
    deadline: number,
  ): Promise<{ auctionAddress: PublicKey; signature: string }> {
    log.info('Initializing auction', {
      merkleTree: merkleTree.toString(),
      authority: authority.toString(),
      collectionMint: collectionMint.toString(),
      basePrice,
      priceIncrement,
      maxSupply,
      minimumItems,
    });

    const [auctionAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from('auction'), authority.toBuffer(), collectionMint.toBuffer()],
      this.program.programId,
    );

    const accounts: InitializeAuctionAccounts = {
      auction: auctionAddress,
      merkleTree,
      collectionMint,
      tokenMint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
      authority,
      bubblegumProgram: new PublicKey(
        'BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY',
      ),
      systemProgram: SystemProgram.programId,
    };

    const tx = await this.program.methods
      .initializeAuction(
        new anchor.BN(basePrice),
        new anchor.BN(priceIncrement),
        new anchor.BN(maxSupply),
        new anchor.BN(minimumItems),
        new anchor.BN(deadline),
      )
      .accounts(accounts)
      .rpc();

    return {
      auctionAddress,
      signature: tx,
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
    log.info('Placing bid through Anchor program', {
      auction: auction.toString(),
      bidder: bidder.toString(),
      amount: amount.toString(),
    });

    const [bidAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from('bid'), auction.toBuffer(), bidder.toBuffer()],
      this.program.programId,
    );

    const auctionState = await this.program.account.auctionState.fetch(auction);

    // Get collection mint from auction PDA
    const [collectionMint] = PublicKey.findProgramAddressSync(
      [Buffer.from('collection'), auction.toBuffer()],
      this.program.programId,
    );

    // Get tree config PDA
    const [treeConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from('TreeConfig'), auctionState.merkleTree.toBuffer()],
      new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY'),
    );

    // Get tree creator from the tree config
    const treeConfigAccount =
      await this.program.provider.connection.getAccountInfo(treeConfig);
    const treeCreator = new PublicKey(treeConfigAccount!.data.slice(8, 40));

    const accounts: PlaceBidAccounts = {
      auction,
      bid: bidAddress,
      bidder,
      merkleTree: auctionState.merkleTree,
      treeConfig,
      treeCreator,
      collectionMint,
      tokenMint: auctionState.tokenMint,
      bidderTokenAccount: await this.findAssociatedTokenAccount(
        bidder,
        auctionState.tokenMint,
      ),
      auctionTokenAccount: await this.findAssociatedTokenAccount(
        auction,
        auctionState.tokenMint,
      ),
      authority: auctionState.authority,
      collectionMetadata: await this.findMetadataAddress(collectionMint),
      collectionEdition: await this.findEditionAddress(collectionMint),
      collectionAuthorityRecordPda: await this.findCollectionAuthorityRecordPda(
        collectionMint,
        auction,
      ),
      bubblegumProgram: new PublicKey(
        'BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY',
      ),
      tokenMetadataProgram: new PublicKey(
        'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
      ),
      compressionProgram: new PublicKey(
        'cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK',
      ),
      logWrapper: new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV'),
      tokenProgram: new PublicKey(
        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      ),
      systemProgram: SystemProgram.programId,
    };

    const tx = await this.program.methods
      .placeBid(new anchor.BN(amount))
      .accounts(accounts)
      .rpc();

    log.info('Bid placed successfully', {
      signature: tx,
    });

    return tx;
  }

  private async findAssociatedTokenAccount(
    owner: PublicKey,
    mint: PublicKey,
  ): Promise<PublicKey> {
    const [ata] = PublicKey.findProgramAddressSync(
      [
        owner.toBuffer(),
        new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA').toBuffer(),
        mint.toBuffer(),
      ],
      new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
    );
    return ata;
  }

  private async findMetadataAddress(mint: PublicKey): Promise<PublicKey> {
    const [metadata] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s').toBuffer(),
        mint.toBuffer(),
      ],
      new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'),
    );
    return metadata;
  }

  private async findEditionAddress(mint: PublicKey): Promise<PublicKey> {
    const [edition] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s').toBuffer(),
        mint.toBuffer(),
        Buffer.from('edition'),
      ],
      new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'),
    );
    return edition;
  }

  private async findCollectionAuthorityRecordPda(
    mint: PublicKey,
    authority: PublicKey,
  ): Promise<PublicKey> {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s').toBuffer(),
        mint.toBuffer(),
        Buffer.from('collection_authority'),
        authority.toBuffer(),
      ],
      new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'),
    );
    return pda;
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
