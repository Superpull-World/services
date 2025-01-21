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
import * as web3 from '@solana/web3.js';

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
  program!: Program<SuperpullProgram>;
  umi!: Umi;
  provider!: anchor.Provider;

  constructor(provider: anchor.AnchorProvider) {
    this.provider = provider;
    log.debug('Initializing Anchor client', {
      IDL,
    });
    // @ts-expect-error IDL type mismatch
    this.program = new Program(IDL, this.provider);

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
    authority_basis_point: number,
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
        new anchor.BN(authority_basis_point),
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

  async findAuctionAddress(authority: PublicKey, collectionMint: PublicKey) {
    const [auctionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('auction'), authority.toBuffer(), collectionMint.toBuffer()],
      this.program.programId,
    );
    return auctionPda;
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

  async withdraw(
    auctionAddress: PublicKey,
    authority: PublicKey,
    collectionMint: PublicKey,
    creators_token_accounts: PublicKey[],
    tokenMint: PublicKey,
    payer: Signer,
  ): Promise<{ signature: string }> {
    const authorityTokenAccount = getAssociatedTokenAddressSync(
      tokenMint,
      authority,
    );
    const auctionTokenAccount = getAssociatedTokenAddressSync(
      tokenMint,
      auctionAddress,
    );
    log.info('Withdrawing from auction', {
      auction: auctionAddress.toString(),
      authority: authority.toString(),
      authorityTokenAccount: authorityTokenAccount.toString(),
      auctionTokenAccount: auctionTokenAccount.toString(),
    });

    // Create lookup table
    const slot = await this.program.provider.connection.getSlot();
    const createLookupTableInst =
      web3.AddressLookupTableProgram.createLookupTable({
        authority: payer.publicKey,
        payer: payer.publicKey,
        recentSlot: slot,
      });

    // Create and send transaction for lookup table creation
    let tx = new web3.Transaction().add(createLookupTableInst[0]);
    const lookupTableAddress = createLookupTableInst[1];
    let txReceipt = await (
      this.program.provider as anchor.AnchorProvider
    ).sendAndConfirm(tx, [payer], {
      skipPreflight: true,
    });
    log.info('Lookup Table Created:', { txReceipt });

    // Extend lookup table with creator token accounts
    const extendInstruction = web3.AddressLookupTableProgram.extendLookupTable({
      payer: payer.publicKey,
      authority: payer.publicKey,
      lookupTable: lookupTableAddress,
      addresses: creators_token_accounts,
    });

    tx = new web3.Transaction().add(extendInstruction);
    txReceipt = await (
      this.program.provider as anchor.AnchorProvider
    ).sendAndConfirm(tx, [payer], {
      skipPreflight: true,
    });
    log.info('Lookup Table Extended:', { txReceipt });

    // Get lookup table account
    const lookupTableAccount = (
      await this.program.provider.connection.getAddressLookupTable(
        lookupTableAddress,
      )
    ).value;

    if (!lookupTableAccount) {
      throw new Error('Failed to fetch lookup table account');
    }

    // Wait for lookup table to be ready
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const collectionMetadata = findMetadataPda(this.umi, {
      mint: fromWeb3JsPublicKey(collectionMint),
    });

    const accounts = {
      auction: auctionAddress,
      authority,
      authorityTokenAccount,
      auctionTokenAccount,
      collectionMetadata: collectionMetadata[0].toString(),
      payer: payer.publicKey,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      metadataProgram: TOKEN_METADATA_PROGRAM_ID,
    };

    // Get withdraw instruction
    const withdrawInstruction = await this.program.methods
      .withdraw()
      .accounts(accounts)
      .remainingAccounts(
        creators_token_accounts.map((account) => ({
          pubkey: account,
          isSigner: false,
          isWritable: true,
        })),
      )
      .instruction();

    // Create versioned transaction
    const { blockhash } =
      await this.program.provider.connection.getLatestBlockhash();

    const message = new web3.TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: blockhash,
      instructions: [withdrawInstruction],
    }).compileToV0Message([lookupTableAccount]);

    const versionedTx = new web3.VersionedTransaction(message);
    versionedTx.sign([payer]);

    // Send and confirm transaction
    const signature = await this.program.provider.connection.sendTransaction(
      versionedTx,
      {
        skipPreflight: true,
      },
    );
    await this.program.provider.connection.confirmTransaction(
      signature,
      'confirmed',
    );

    log.info('Withdrawal completed successfully', { signature });
    return { signature };
  }
}
