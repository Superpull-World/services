import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import {
  PublicKey,
  Signer,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import { log } from '@temporalio/activity';
import { SuperpullProgram } from '../types/superpull_program';
import IDL from '../idl/superpull_program.json';
import {
  fetchTreeConfigFromSeeds,
  mplBubblegum,
} from '@metaplex-foundation/mpl-bubblegum';
import {
  fromWeb3JsPublicKey,
  toWeb3JsPublicKey,
} from '@metaplex-foundation/umi-web3js-adapters';
import { Umi } from '@metaplex-foundation/umi';
import {
  findMetadataPda,
  findMasterEditionPda,
  mplTokenMetadata,
} from '@metaplex-foundation/mpl-token-metadata';
import {
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  AUCTION_MINTS,
  TOKEN_METADATA_PROGRAM_ID,
  BUBBLEGUM_PROGRAM_ID,
  COMPRESSION_PROGRAM_ID,
  LOG_WRAPPER_PROGRAM_ID,
} from '../config/env';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';

interface InitializeAuctionAccounts {
  auction: PublicKey;
  merkleTree: PublicKey;
  collectionMint: PublicKey;
  tokenMint: PublicKey;
  authority: PublicKey;
  bubblegumProgram: PublicKey;
  systemProgram: PublicKey;
}

export class AnchorClient {
  program: Program<SuperpullProgram>;
  umi: Umi;

  constructor(provider: anchor.AnchorProvider) {
    log.debug('Initializing Anchor client', {
      IDL,
    });
    // @ts-expect-error IDL type mismatch
    this.program = new Program(IDL, provider);

    // Initialize UMI
    this.umi = createUmi(provider.connection.rpcEndpoint)
      .use(mplTokenMetadata())
      .use(mplBubblegum());
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
    tokenMint: PublicKey,
  ): Promise<{ auctionAddress: PublicKey; signature: string }> {
    const auction_mint = AUCTION_MINTS.find(
      (mint) => mint.mint.toString() === tokenMint.toString(),
    );
    // Validate that the token mint is in the accepted list
    if (!auction_mint) {
      throw new Error(
        `Token mint ${tokenMint.toBase58()} is not in the list of accepted mints`,
      );
    }

    log.info('Initializing auction', {
      merkleTree: merkleTree.toString(),
      authority: authority.toString(),
      collectionMint: collectionMint.toString(),
      tokenMint: tokenMint.toString(),
      basePrice: basePrice * 10 ** auction_mint.decimals,
      priceIncrement: priceIncrement * 10 ** auction_mint.decimals,
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
      tokenMint,
      authority,
      bubblegumProgram: BUBBLEGUM_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    };

    const tx = await this.program.methods
      .initializeAuction(
        new anchor.BN(basePrice * 10 ** auction_mint.decimals),
        new anchor.BN(priceIncrement * 10 ** auction_mint.decimals),
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
    umi: Umi,
    payer: Signer,
    returnInstruction = false,
  ): Promise<{ instruction?: TransactionInstruction; signature?: string }> {
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
    log.info('Auction state', {
      auctionState: auctionState,
    });

    // Get tree config PDA
    const treeConfig = await fetchTreeConfigFromSeeds(umi, {
      merkleTree: fromWeb3JsPublicKey(auctionState.merkleTree),
    });

    const bidderTokenAccount = getAssociatedTokenAddressSync(
      auctionState.tokenMint,
      bidder,
    );
    const auctionTokenAccount = await getOrCreateAssociatedTokenAccount(
      this.program.provider.connection,
      payer,
      auctionState.tokenMint,
      auction,
      true,
    );
    const collectionMetadata = findMetadataPda(this.umi, {
      mint: fromWeb3JsPublicKey(auctionState.collectionMint),
    });
    const collectionEdition = findMasterEditionPda(this.umi, {
      mint: fromWeb3JsPublicKey(auctionState.collectionMint),
    });
    const bubblegumSigner = PublicKey.findProgramAddressSync(
      [Buffer.from('collection_cpi', 'utf-8')],
      BUBBLEGUM_PROGRAM_ID,
    )[0];

    log.info('Bid address', {
      bid: bidAddress.toString(),
      bidder: bidder.toString(),
      merkleTree: auctionState.merkleTree.toString(),
      treeConfig: treeConfig.publicKey.toString(),
      treeCreator: payer.publicKey.toString(),
      collectionMint: auctionState.collectionMint.toString(),
      collectionMetadata: collectionMetadata.toString(),
      collectionEdition: collectionEdition.toString(),
      tokenMint: auctionState.tokenMint.toString(),
      authority: auctionState.authority.toString(),
      bubblegumSigner: bubblegumSigner.toString(),
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID.toString(),
      compressionProgram: COMPRESSION_PROGRAM_ID.toString(),
      logWrapper: LOG_WRAPPER_PROGRAM_ID.toString(),
      bubblegumProgram: BUBBLEGUM_PROGRAM_ID.toString(),
      systemProgram: SystemProgram.programId.toString(),
      tokenProgram: TOKEN_PROGRAM_ID.toString(),
    });
    const accounts = {
      auction,
      bid: bidAddress,
      bidder,
      bidderTokenAccount,
      auctionTokenAccount: auctionTokenAccount.address,
      collectionMint: auctionState.collectionMint,
      collectionMetadata: collectionMetadata[0].toString(),
      collectionEdition: collectionEdition[0].toString(),
      merkleTree: auctionState.merkleTree,
      treeConfig: toWeb3JsPublicKey(treeConfig.publicKey),
      treeCreator: payer.publicKey,
      bubblegumSigner: bubblegumSigner,
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      compressionProgram: COMPRESSION_PROGRAM_ID,
      logWrapper: LOG_WRAPPER_PROGRAM_ID,
      bubblegumProgram: BUBBLEGUM_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    };
    log.info('Place bid accounts', {
      accounts: accounts,
    });

    const method = this.program.methods
      .placeBid(new anchor.BN(amount))
      .accounts(accounts);

    if (returnInstruction) {
      const instruction = await method.instruction();
      return { instruction };
    }

    const signature = await method.rpc();
    log.info('Bid placed successfully', { signature });
    return { signature };
  }

  async getAuctionState(auctionAddress: PublicKey) {
    log.info('Getting auction state', {
      auctionAddress: auctionAddress.toString(),
    });

    try {
      const state = await this.program.account.auctionState.fetch(
        auctionAddress,
        'confirmed',
      );

      log.info('Auction state retrieved', {
        auctionAddress: auctionAddress.toString(),
        state: {
          authority: state.authority.toString(),
          merkleTree: state.merkleTree.toString(),
          basePrice: state.basePrice.toString(),
          collectionMint: state.collectionMint.toString(),
          tokenMint: state.tokenMint.toString(),
          priceIncrement: state.priceIncrement.toString(),
          maxSupply: state.maxSupply.toString(),
          currentSupply: state.currentSupply.toString(),
        },
      });

      return state;
    } catch (error) {
      log.error('Error fetching auction state', {
        error,
      });
      throw error;
    }
  }
}
