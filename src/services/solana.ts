import * as anchor from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  NONCE_ACCOUNT_LENGTH,
  TransactionInstruction,
  Signer,
} from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  createTree,
  fetchTreeConfigFromSeeds,
  mplBubblegum,
  setTreeDelegate,
  TreeConfig,
} from '@metaplex-foundation/mpl-bubblegum';
import {
  createNft,
  mplTokenMetadata,
  findMetadataPda,
  deserializeMetadata,
  verifyCollectionV1,
  updateV1,
} from '@metaplex-foundation/mpl-token-metadata';
import {
  keypairIdentity,
  percentAmount,
  generateSigner,
  none,
  some,
  createSignerFromKeypair,
  Umi,
} from '@metaplex-foundation/umi';
import {
  fromWeb3JsKeypair,
  fromWeb3JsPublicKey,
} from '@metaplex-foundation/umi-web3js-adapters';
import { log } from '@temporalio/activity';
import { AnchorClient } from './anchor-client';
import { SuperpullProgram } from '../types/superpull_program';
import {
  getMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  getMinimumBalanceForRentExemptAccount,
} from '@solana/spl-token';
import {
  DasApiAsset,
  DasApiAssetCreator,
} from '@metaplex-foundation/digital-asset-standard-api';

// Constants
const MAX_DEPTH = 14;
const MAX_BUFFER_SIZE = 64;
const COLLECTION_NAME = 'SuperPull Auctions Collection';
const COLLECTION_SYMBOL = 'SPULL';
const COLLECTION_URI = 'https://assets.superpull.world/collection.json';

export interface NFTMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
}

export interface GetAuctionAddressesInput {
  authority?: string;
  isGraduated?: boolean;
  limit?: number;
  offset?: number;
}

export interface GetAuctionAddressesOutput {
  auctions: string[];
  total: number;
}

export class SolanaService {
  private static instance: SolanaService;
  private connection: Connection;
  public payer: Keypair;
  private umi: Umi;
  private anchorClient: AnchorClient;
  private collectionMint!: Keypair;

  public static getInstance(): SolanaService {
    if (!SolanaService.instance) {
      SolanaService.instance = new SolanaService();
    }
    return SolanaService.instance;
  }

  private constructor(
    endpoint: string = process.env.SOLANA_RPC_ENDPOINT ||
      'https://api.devnet.solana.com',
    payerPrivateKey: string = process.env.SOLANA_PRIVATE_KEY!,
  ) {
    this.connection = new Connection(endpoint, {
      commitment: 'confirmed',
    });
    this.payer = Keypair.fromSecretKey(
      Buffer.from(JSON.parse(payerPrivateKey)),
    );
    this.collectionMint = Keypair.fromSecretKey(
      Buffer.from(JSON.parse(process.env.COLLECTION_PRIVATE_KEY!)),
    );

    this.umi = createUmi(endpoint)
      .use(keypairIdentity(fromWeb3JsKeypair(this.payer)))
      .use(mplBubblegum())
      .use(mplTokenMetadata());

    // Initialize Anchor client
    const provider = new anchor.AnchorProvider(
      this.connection,
      new anchor.Wallet(this.payer),
      { commitment: 'confirmed', skipPreflight: true },
    );
    this.anchorClient = new AnchorClient(provider);

    // Initialize collection on service startup
    this.initializeCollectionOnStartup();
  }

  public async getTreeConfig(merkleTree: PublicKey): Promise<TreeConfig> {
    return fetchTreeConfigFromSeeds(this.umi, {
      merkleTree: fromWeb3JsPublicKey(merkleTree),
    });
  }

  private async initializeCollectionOnStartup(): Promise<void> {
    try {
      log.info('Checking for collection mint', {
        collectionAddress: this.collectionMint.publicKey.toString(),
      });

      try {
        const collectionAccount = await this.connection.getAccountInfo(
          this.collectionMint.publicKey,
        );

        if (!collectionAccount) {
          // Collection doesn't exist, create it
          log.info('Creating collection mint', {
            collectionMint: this.collectionMint.publicKey.toString(),
          });

          // Convert the collection mint keypair to Umi signer format
          const collectionKeypair = this.umi.eddsa.createKeypairFromSecretKey(
            this.collectionMint.secretKey,
          );
          const collectionSigner = createSignerFromKeypair(
            this.umi,
            collectionKeypair,
          );

          const builder = createNft(this.umi, {
            mint: collectionSigner,
            name: COLLECTION_NAME,
            symbol: COLLECTION_SYMBOL,
            uri: COLLECTION_URI,
            sellerFeeBasisPoints: percentAmount(0),
            isCollection: true,
            creators: none(),
            collection: none(),
            uses: none(),
          });

          await builder.sendAndConfirm(this.umi);

          log.info('Collection mint created');
        } else {
          log.info('Collection mint already exists');
        }
      } catch (error) {
        // Log the error but don't throw, allow the service to continue without collection support.
        log.warn(
          'Failed to initialize collection. Service will continue without collection support.',
          {
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    } catch (error) {
      // Log any unexpected errors but don't throw
      log.error('Unexpected error during collection initialization', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public async createMerkleTree(): Promise<PublicKey> {
    try {
      // Generate a new signer for the tree
      const merkleTreeKeypair = generateSigner(this.umi);

      const debugLogData = {
        maxDepth: MAX_DEPTH.toString(),
        maxBufferSize: MAX_BUFFER_SIZE.toString(),
      };
      log.debug('Creating Merkle tree', debugLogData);

      // Create the tree with default parameters for compressed NFTs
      const treeBuilder = await createTree(this.umi, {
        maxDepth: MAX_DEPTH,
        maxBufferSize: MAX_BUFFER_SIZE,
        public: some(false),
        merkleTree: merkleTreeKeypair,
      });

      // Send and confirm the tree creation
      await treeBuilder.sendAndConfirm(this.umi);

      const infoLogData = {
        treeAddress: merkleTreeKeypair.publicKey.toString(),
      };
      log.info('Merkle tree created', infoLogData);

      return new PublicKey(merkleTreeKeypair.publicKey);
    } catch (error) {
      log.error('Error creating Merkle tree:', error as Error);
      throw error;
    }
  }

  public async createNft(
    name: string,
    description: string,
    authority: PublicKey,
    creators: {
      address: PublicKey;
      verified: boolean;
      share: number;
    }[],
  ): Promise<{
    collectionMint: PublicKey;
    txId: string;
    merkleTree: PublicKey;
  }> {
    try {
      log.info('Creating collection NFT', {
        name,
        authority: authority.toString(),
      });

      // Generate a new signer for the collection
      const collectionSigner = generateSigner(this.umi);

      const someCreators = some(
        creators.map((creator) => ({
          address: fromWeb3JsPublicKey(creator.address),
          verified: creator.verified,
          share: creator.share,
        })),
      );

      // Create the collection NFT
      const builder = createNft(this.umi, {
        mint: collectionSigner,
        name,
        symbol: COLLECTION_SYMBOL,
        uri: COLLECTION_URI,
        sellerFeeBasisPoints: percentAmount(0),
        isCollection: true,
        creators: someCreators,
        collection: {
          key: fromWeb3JsPublicKey(this.collectionMint.publicKey),
          verified: false,
        },
        uses: none(),
      });

      const result = await builder.sendAndConfirm(this.umi);

      // Create merkle tree for the auction
      const merkleTree = await this.createMerkleTree();

      return {
        collectionMint: new PublicKey(collectionSigner.publicKey),
        txId: result.signature.toString(),
        merkleTree,
      };
    } catch (error) {
      log.error('Error creating collection NFT:', error as Error);
      throw error;
    }
  }

  public async findAuctionAddress(
    authority: PublicKey,
    collectionMint: PublicKey,
  ): Promise<PublicKey> {
    return this.anchorClient.findAuctionAddress(authority, collectionMint);
  }

  public async verifyCollection(
    collectionMint: PublicKey,
  ): Promise<{ txId: string }> {
    try {
      const metadata = await findMetadataPda(this.umi, {
        mint: fromWeb3JsPublicKey(collectionMint),
      });

      log.info('Verifying collection', {
        collectionMint: this.collectionMint.publicKey.toString(),
        metadata: metadata.toString(),
      });

      const verifyBuilder = verifyCollectionV1(this.umi, {
        collectionMint: fromWeb3JsPublicKey(this.collectionMint.publicKey),
        metadata: metadata,
      });
      const result = await verifyBuilder.sendAndConfirm(this.umi, {
        send: {
          skipPreflight: true,
        },
      });

      return {
        txId: result.signature.toString(),
      };
    } catch (error) {
      log.error('Error verifying collection:', error as Error);
      throw error;
    }
  }

  public async updateCollectionAuthority(
    collectionMint: PublicKey,
    auctionPda: PublicKey,
    merkleTree: PublicKey,
  ): Promise<{ txId: string }> {
    try {
      log.info('Updating collection authority', {
        collectionMint: collectionMint.toString(),
        auctionPda: auctionPda.toString(),
      });

      log.info('Delegating tree authority', {
        merkleTree: merkleTree.toString(),
        delegate: auctionPda.toString(),
      });
      const setTreeDelegateBuilder = setTreeDelegate(this.umi, {
        newTreeDelegate: fromWeb3JsPublicKey(auctionPda),
        merkleTree: fromWeb3JsPublicKey(merkleTree),
      });
      await setTreeDelegateBuilder.sendAndConfirm(this.umi, {
        send: {
          skipPreflight: true,
        },
      });

      log.info('Tree authority delegated', {
        merkleTree: merkleTree.toString(),
        delegate: auctionPda.toString(),
      });

      log.info('Updating collection updateauthority', {
        collectionMint: collectionMint.toString(),
        auctionPda: auctionPda.toString(),
      });

      const updateBuilder = updateV1(this.umi, {
        mint: fromWeb3JsPublicKey(collectionMint),
        authority: createSignerFromKeypair(
          this.umi,
          fromWeb3JsKeypair(this.payer),
        ),
        newUpdateAuthority: fromWeb3JsPublicKey(auctionPda),
      });

      const result = await updateBuilder.sendAndConfirm(this.umi);

      log.info('Collection authority updated', {
        txId: result.signature.toString(),
      });

      return {
        txId: result.signature.toString(),
      };
    } catch (error) {
      log.error('Error updating collection authority:', error as Error);
      throw error;
    }
  }

  public async initializeAuction(
    merkleTree: PublicKey,
    authority: PublicKey,
    collectionMint: PublicKey,
    initialPrice: number,
    priceIncrement: number,
    maxSupply: number,
    minimumItems: number,
    deadline: number,
    tokenMint: PublicKey,
    authorityBasisPoint: number,
  ): Promise<{ auctionAddress: PublicKey; txId: string }> {
    try {
      const result = await this.anchorClient.initializeAuction(
        merkleTree,
        collectionMint,
        authority,
        initialPrice,
        priceIncrement,
        maxSupply,
        minimumItems,
        deadline,
        tokenMint,
        authorityBasisPoint,
      );

      return {
        auctionAddress: result.auctionAddress,
        txId: result.signature,
      };
    } catch (error) {
      log.error('Error initializing auction:', error as Error);
      throw error;
    }
  }

  public async getBidDetails(
    auctionAddress: string,
    bidderAddress: string,
  ): Promise<{
    address: string;
    auction: string;
    bidder: string;
    amount: number;
    count: number;
  }> {
    const bidAddress = await this.anchorClient.findBidAddress(
      new PublicKey(auctionAddress),
      new PublicKey(bidderAddress),
    );
    const bidState = await this.anchorClient.getBidState(bidAddress);
    return {
      address: bidAddress.toString(),
      auction: auctionAddress,
      bidder: bidState.bidder.toString(),
      amount: bidState.amount.toNumber(),
      count: bidState.count,
    };
  }

  public async getAuctionDetails(auctionAddress: string): Promise<{
    address: string;
    state: anchor.IdlAccounts<SuperpullProgram>['auctionState'];
    creators: DasApiAssetCreator[];
  }> {
    try {
      log.info('Fetching auction details', {
        auctionAddress,
      });
      const address = new PublicKey(auctionAddress);
      const state = await this.anchorClient.getAuctionState(address);
      log.info('Auction state fetched', {
        state,
      });
      const asset = await this.umi.rpc.getAsset(
        fromWeb3JsPublicKey(state.collectionMint),
      );
      log.info('Asset fetched', {
        asset,
      });

      return {
        address: auctionAddress,
        state,
        creators: asset.creators,
      };
    } catch (error) {
      log.error('Error getting auction details:', error as Error);
      throw error;
    }
  }

  async createDurableNonceTransaction(
    authority: PublicKey,
    getInstruction: (
      umi: Umi,
      payer: Signer,
    ) => Promise<TransactionInstruction>,
  ): Promise<{ transaction: Transaction; lastValidBlockHeight: number }> {
    // Create a new nonce account
    const nonceAccount = Keypair.generate();
    const minimumAmount =
      await this.connection.getMinimumBalanceForRentExemption(
        NONCE_ACCOUNT_LENGTH,
      );

    // Create and initialize nonce account
    log.info('Creating nonce account', {
      nonceAccount: nonceAccount.publicKey.toString(),
      minimumAmount,
    });
    const createNonceAccountIx = SystemProgram.createAccount({
      fromPubkey: this.payer.publicKey,
      newAccountPubkey: nonceAccount.publicKey,
      lamports: minimumAmount,
      space: NONCE_ACCOUNT_LENGTH,
      programId: SystemProgram.programId,
    });

    log.info('Initializing nonce account', {
      nonceAccount: nonceAccount.publicKey.toString(),
      authorizedPubkey: authority.toString(),
    });
    const initializeNonceIx = SystemProgram.nonceInitialize({
      noncePubkey: nonceAccount.publicKey,
      authorizedPubkey: authority,
    });

    // First create and send the transaction to create the nonce account
    const setupTx = new Transaction();
    setupTx.add(createNonceAccountIx, initializeNonceIx);
    setupTx.feePayer = this.payer.publicKey;

    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash();
    setupTx.recentBlockhash = blockhash;
    setupTx.lastValidBlockHeight = lastValidBlockHeight;
    setupTx.sign(this.payer, nonceAccount);

    log.info('Sending setup transaction', {
      txId: await this.sendTransaction(setupTx),
    });

    // Get the nonce account data
    log.info('Getting nonce account data', {
      nonceAccount: nonceAccount.publicKey.toString(),
    });
    const nonceAccountData = await this.connection.getAccountInfo(
      nonceAccount.publicKey,
    );
    if (!nonceAccountData) {
      throw new Error('Failed to create nonce account');
    }

    // Create the actual transaction using the nonce
    const advanceNonceIx = SystemProgram.nonceAdvance({
      noncePubkey: nonceAccount.publicKey,
      authorizedPubkey: authority,
    });

    // Get the instruction that uses the nonce
    const instruction = await getInstruction(this.umi, this.payer);

    // Create the transaction
    const transaction = new Transaction();
    transaction.add(advanceNonceIx);
    transaction.add(instruction);
    transaction.feePayer = this.payer.publicKey;

    // Use the nonce as the blockhash
    const nonceAccount2 = await this.connection.getNonce(
      nonceAccount.publicKey,
    );
    if (!nonceAccount2?.nonce) {
      throw new Error('Failed to get nonce value');
    }
    transaction.recentBlockhash = nonceAccount2.nonce;

    return { transaction, lastValidBlockHeight };
  }

  async sendTransaction(transaction: Transaction): Promise<string> {
    try {
      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: true },
      );
      const blockhash = await this.connection.getLatestBlockhash();

      // Wait for confirmation
      const confirmation = await this.connection.confirmTransaction({
        signature,
        blockhash: blockhash.blockhash,
        lastValidBlockHeight: blockhash.lastValidBlockHeight,
      });

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err}`);
      }

      return signature;
    } catch (error) {
      throw new Error(
        `Failed to send transaction: ${(error as Error).message}`,
      );
    }
  }

  async createBidTransaction(input: {
    auctionAddress: string;
    bidderAddress: string;
    bidAmount: number;
  }): Promise<{
    success: boolean;
    message?: string;
    transaction?: string;
    lastValidBlockHeight?: number;
  }> {
    try {
      log.info('Starting bid transaction creation', {
        auctionAddress: input.auctionAddress,
        bidderAddress: input.bidderAddress,
        bidAmount: input.bidAmount,
      });

      // Get the auction details
      log.info('Fetching auction details');
      const auction = await this.getAuctionDetails(input.auctionAddress);
      if (!auction) {
        log.warn('Auction not found', {
          auctionAddress: input.auctionAddress,
        });
        return {
          success: false,
          message: 'Auction not found',
        };
      }
      log.info('Auction details fetched', {
        auctionState: auction.state,
      });

      // Create a durable nonce transaction
      log.info('Creating durable nonce transaction');
      const { transaction, lastValidBlockHeight } =
        await this.createDurableNonceTransaction(
          new PublicKey(input.bidderAddress),
          async (umi, payer) => {
            log.info('Creating bid instruction', {
              bidderPubkey: input.bidderAddress,
              payerPubkey: payer.publicKey.toString(),
              bidAmount: input.bidAmount,
            });
            const { instruction } = await this.anchorClient.placeBid(
              new PublicKey(input.auctionAddress),
              new PublicKey(input.bidderAddress),
              input.bidAmount,
              umi,
              payer,
              true,
            );
            if (!instruction) {
              log.error('Failed to get bid instruction');
              throw new Error('Failed to get bid instruction');
            }
            log.info('Bid instruction created successfully', {
              programId: instruction.programId.toString(),
              keys: instruction.keys.map((k) => ({
                pubkey: k.pubkey.toString(),
                isSigner: k.isSigner,
                isWritable: k.isWritable,
              })),
            });
            return instruction;
          },
        );

      log.info('Signing transaction with payer');
      transaction.sign(this.payer);

      // Serialize and encode the transaction
      log.info('Serializing transaction');
      const serializedTransaction = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });
      const encodedTransaction = Buffer.from(serializedTransaction).toString(
        'base64',
      );

      log.info('Transaction created successfully', {
        transactionLength: serializedTransaction.length,
        lastValidBlockHeight,
      });

      return {
        success: true,
        transaction: encodedTransaction,
        lastValidBlockHeight,
      };
    } catch (error) {
      log.error('Error in createBidTransaction:', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack, name: error.name }
            : String(error),
        input: {
          auctionAddress: input.auctionAddress,
          bidderAddress: input.bidderAddress,
          bidAmount: input.bidAmount,
        },
      });
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async submitSignedBidTransaction(signedTransaction: string): Promise<{
    success: boolean;
    message?: string;
    signature?: string;
  }> {
    try {
      log.info('Starting to submit signed bid transaction');

      // Decode the signed transaction
      log.info('Decoding signed transaction');
      const decodedTransaction = Buffer.from(signedTransaction, 'base64');
      const transaction = Transaction.from(decodedTransaction);

      log.info('Transaction decoded successfully', {
        numInstructions: transaction.instructions.length,
        signers: transaction.signatures.map((s) => s.publicKey.toString()),
      });

      // Submit the transaction
      log.info('Submitting transaction to network');
      const signature = await this.sendTransaction(transaction);

      log.info('Transaction submitted successfully', { signature });

      return {
        success: true,
        signature,
      };
    } catch (error) {
      log.error('Error in submitSignedBidTransaction:', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack, name: error.name }
            : String(error),
      });
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  public async getTokenMetadata(mint: PublicKey) {
    // Get SPL token info
    const mintInfo = await getMint(this.connection, mint);

    try {
      // Get MPL metadata
      const [metadataPda] = findMetadataPda(this.umi, {
        mint: fromWeb3JsPublicKey(mint),
      });
      const metadata = await this.umi.rpc.getAccount(metadataPda);

      if (!metadata.exists) {
        // Return default values if metadata not found
        return {
          name: mint.toString().slice(0, 8), // First 8 chars of mint address
          symbol: undefined,
          uri: undefined,
          decimals: mintInfo.decimals,
          supply: mintInfo.supply.toString(),
        };
      }

      const tokenMetadata = deserializeMetadata(metadata);
      return {
        name: tokenMetadata.name.trim().replace(/\0/g, ''),
        symbol: tokenMetadata.symbol.trim().replace(/\0/g, ''),
        uri: tokenMetadata.uri.trim().replace(/\0/g, ''),
        decimals: mintInfo.decimals,
        supply: mintInfo.supply.toString(),
      };
    } catch (error) {
      log.error('Error fetching token metadata:', error as Error);
      // Return default values if metadata fetch fails
      return {
        name: mint.toString().slice(0, 8),
        symbol: 'UNKNOWN',
        uri: '',
        decimals: mintInfo.decimals,
        supply: mintInfo.supply.toString(),
      };
    }
  }

  public async getTokenBalance(
    tokenMint: PublicKey,
    walletAddress: PublicKey,
  ): Promise<string> {
    try {
      const tokenAccount = await getAccount(
        this.connection,
        await this.connection
          .getTokenAccountsByOwner(walletAddress, {
            mint: tokenMint,
          })
          .then((accounts) => accounts.value[0]?.pubkey),
        'confirmed',
      );
      return tokenAccount.amount.toString();
    } catch {
      log.debug(`No token account found for ${tokenMint.toBase58()}`);
      return '0';
    }
  }

  public async getAuctionAddresses(): Promise<GetAuctionAddressesOutput> {
    try {
      const accounts = await this.getCollectionChildren(
        this.collectionMint.publicKey,
      );
      const authorities = accounts.map((account) =>
        account.authorities.map((authority) => authority.address),
      );
      log.info('Auction addresses fetched', {
        auctions: authorities,
        total: accounts.length,
      });
      return {
        auctions: authorities.map((authority) => authority.toString()),
        total: accounts.length,
      };
    } catch (error) {
      log.error('Error getting auction addresses:', error as Error);
      throw error;
    }
  }

  public async getCollectionChildren(
    collectionAddress: PublicKey,
    limit: number = 1000,
  ): Promise<DasApiAsset[]> {
    try {
      log.info('Fetching collection children', {
        collectionAddress: collectionAddress.toString(),
        limit,
      });
      const nfts = await this.umi.rpc.getAssetsByGroup({
        groupKey: 'collection',
        groupValue: collectionAddress.toString(),
        sortBy: { sortBy: 'created', sortDirection: 'asc' },
        limit,
      });

      log.info('Collection children fetched', {
        collectionAddress: collectionAddress.toString(),
        total: nfts.total,
        items: nfts.items,
      });

      return nfts.items;
    } catch (error) {
      log.error('Error getting collection children:', error as Error);
      return [];
    }
  }

  async withdraw(
    auctionAddress: PublicKey,
    authority: PublicKey,
    collectionMint: PublicKey,
    creators: PublicKey[],
    tokenMint: PublicKey,
  ): Promise<{
    success: boolean;
    message?: string;
    signature?: string;
  }> {
    log.info('Withdrawing from auction', {
      auctionAddress: auctionAddress.toString(),
      authority: authority.toString(),
      collectionMint: collectionMint.toString(),
      creators: creators.map((creator) => creator.toString()),
      tokenMint: tokenMint.toString(),
    });

    const creators_token_accounts = await Promise.all(
      creators.map(async (creator) => {
        try {
          const ix = SystemProgram.createAccount({
            fromPubkey: this.payer.publicKey,
            newAccountPubkey: creator,
            lamports: 1,
            space: await getMinimumBalanceForRentExemptAccount(this.connection),
            programId: SystemProgram.programId,
          });
          await this.sendTransaction(new Transaction().add(ix));
        } catch (error) {
          log.error('Error creating creator account:', error as Error);
        }
        try {
          const tokenAccount = await getOrCreateAssociatedTokenAccount(
            this.connection,
            this.payer,
            tokenMint,
            creator,
            false,
          );
          return tokenAccount;
        } catch {
          log.error('Error getting or creating associated token account');
          const tokenAccount = await getOrCreateAssociatedTokenAccount(
            this.connection,
            this.payer,
            tokenMint,
            creator,
            true,
          );
          return tokenAccount;
        }
      }),
    );
    try {
      await this.anchorClient.withdraw(
        auctionAddress,
        authority,
        collectionMint,
        creators_token_accounts.map((creator) => creator.address),
        tokenMint,
        this.payer,
      );
      return {
        success: true,
        message: 'Withdrawal successful',
      };
    } catch (error) {
      log.error('Error withdrawing from auction:', error as Error);
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
