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
  TreeConfig,
} from '@metaplex-foundation/mpl-bubblegum';
import {
  createNft,
  mplTokenMetadata,
  findCollectionAuthorityRecordPda,
  approveCollectionAuthority,
  findMetadataPda,
  deserializeMetadata,
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
  toWeb3JsPublicKey,
} from '@metaplex-foundation/umi-web3js-adapters';
import { log } from '@temporalio/activity';
import bs58 from 'bs58';
import { AUCTION_MINTS } from '../config/env';
import { AnchorClient } from './anchor-client';
import { SuperpullProgram } from '../types/superpull_program';
import { getMint } from '@solana/spl-token';

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

export class SolanaService {
  private connection: Connection;
  public payer: Keypair;
  private umi: Umi;
  private anchorClient: AnchorClient;
  private collectionMint!: Keypair;

  constructor(
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
        log.warn('Failed to initialize collection. Service will continue without collection support.', {
          error: error instanceof Error ? error.message : String(error),
        });
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
        public: some(true),
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

  public async createAuctionCollection(
    name: string,
    description: string,
    authority: PublicKey,
  ): Promise<{ collectionMint: PublicKey; txId: string }> {
    try {
      log.info('Creating auction collection', {
        name,
        authority: authority.toString(),
      });

      // Generate a new signer for the collection
      const collectionSigner = generateSigner(this.umi);

      // Create the collection NFT
      const builder = createNft(this.umi, {
        mint: collectionSigner,
        name,
        symbol: COLLECTION_SYMBOL,
        uri: COLLECTION_URI,
        sellerFeeBasisPoints: percentAmount(0),
        isCollection: true,
        creators: none(),
        collection: {
          key: fromWeb3JsPublicKey(this.collectionMint.publicKey),
          verified: false,
        },
        uses: none(),
      });

      const result = await builder.sendAndConfirm(this.umi);
      log.info('Auction Collection mint created', {
        collectionMint: collectionSigner.publicKey.toString(),
      });

      // Derive the auction PDA
      const [auctionPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('auction'),
          authority.toBuffer(),
          toWeb3JsPublicKey(collectionSigner.publicKey).toBuffer(),
        ],
        this.anchorClient.program.programId,
      );

      // Set the auction PDA as the collection authority
      const collectionAuthorityRecord = findCollectionAuthorityRecordPda(
        this.umi,
        {
          mint: collectionSigner.publicKey,
          collectionAuthority: fromWeb3JsPublicKey(auctionPda),
        },
      );

      log.info('Setting auction collection authority', {
        collectionMint: collectionSigner.publicKey.toString(),
        auctionPda: auctionPda.toString(),
        collectionAuthorityRecord: collectionAuthorityRecord.toString(),
      });
      const setAuthorityBuilder = approveCollectionAuthority(this.umi, {
        mint: collectionSigner.publicKey,
        newCollectionAuthority: fromWeb3JsPublicKey(auctionPda),
        collectionAuthorityRecord,
      });

      await setAuthorityBuilder.sendAndConfirm(this.umi, {
        send: {
          skipPreflight: true,
        },
      });

      const logMetadata = {
        collectionMint: collectionSigner.publicKey.toString(),
        authority: authority.toString(),
        txId: result.signature.toString(),
      };
      log.info('Auction collection created', logMetadata);

      return {
        collectionMint: new PublicKey(collectionSigner.publicKey),
        txId: result.signature.toString(),
      };
    } catch (error) {
      log.error('Error creating auction collection:', error as Error);
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

  public async getAuctions(
    filters: {
      authority?: string;
      isGraduated?: boolean;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{
    auctions: Array<{
      address: string;
      state: anchor.IdlAccounts<SuperpullProgram>['auctionState'];
    }>;
    total: number;
  }> {
    try {
      log.info('Fetching auction accounts with filters', {
        filters,
      });

      // Build memcmp filters
      const memcmpFilters: Array<{
        memcmp: {
          offset: number;
          bytes: string;
        };
      }> = [];

      // Add discriminator filter for AuctionState
      const discriminator = Buffer.from([252, 227, 205, 147, 72, 64, 250, 126]);
      memcmpFilters.push({
        memcmp: {
          offset: 0,
          bytes: bs58.encode(discriminator),
        },
      });

      // Add authority filter if provided
      if (filters.authority) {
        memcmpFilters.push({
          memcmp: {
            offset: 8, // After discriminator
            bytes: new PublicKey(filters.authority).toBase58(),
          },
        });
      }

      // Add isGraduated filter if provided
      if (filters.isGraduated) {
        // Offset calculation based on AuctionState layout:
        // 8 (discriminator) +
        // 32 (authority) +
        // 32 (merkle_tree) +
        // 32 (token_mint) +
        // 32 (collection_mint) +
        // 8 (base_price) +
        // 8 (price_increment) +
        // 8 (current_supply) +
        // 8 (max_supply) +
        // 8 (total_value_locked) +
        // 8 (minimum_items) +
        // 8 (deadline)
        // = 192 bytes before is_graduated
        memcmpFilters.push({
          memcmp: {
            offset: 192,
            bytes: bs58.encode(Buffer.from([filters.isGraduated ? 1 : 0])),
          },
        });
      }

      // Fetch accounts with filters
      const accounts = await this.connection.getProgramAccounts(
        this.anchorClient.program.programId,
        {
          commitment: 'confirmed',
          filters: memcmpFilters,
          dataSlice: {
            offset: 0,
            length: 0, // We don't need the data yet, just get addresses
          },
        },
      );

      log.info('Found auction accounts', {
        total: accounts.length,
      });

      // Get full account data for all accounts
      const allAuctionDetails = await Promise.all(
        accounts.map(async (account) => {
          try {
            const accountInfo = await this.connection.getAccountInfo(
              account.pubkey,
              'confirmed',
            );
            if (!accountInfo) {
              log.warn('Account not found', {
                account: account.pubkey.toString(),
              });
              return null;
            }

            // Check if account data is large enough for an auction state
            if (accountInfo.data.length < 192) {
              // log.warn('Account data too small to be an auction state', {
              //   account: account.pubkey.toString(),
              //   dataLength: accountInfo.data.length,
              // });
              return null;
            }

            try {
              const state = this.anchorClient.program.coder.accounts.decode(
                'auctionState',
                accountInfo.data,
              );
              return {
                address: account.pubkey.toString(),
                state,
              };
            } catch (decodeError) {
              log.warn('Error decoding auction account', {
                account: account.pubkey.toString(),
                error: decodeError,
                dataLength: accountInfo.data.length,
              });
              return null;
            }
          } catch (error) {
            log.warn('Error fetching account info', {
              account: account.pubkey.toString(),
              error,
            });
            return null;
          }
        }),
      );

      // Filter out null results and auctions with non-accepted token mints
      const validAuctions = allAuctionDetails.filter(
        (auction): auction is NonNullable<typeof auction> => {
          if (!auction) return false;

          // Check if the auction's token mint is in the accepted list
          const tokenMint = auction.state.tokenMint.toString();
          return AUCTION_MINTS.some(
            (mint) => mint.mint.toString() === tokenMint,
          );
        },
      );

      // Apply pagination after filtering
      const start = Math.max(0, filters.offset || 0);
      const maxEnd = validAuctions.length;
      const end = filters.limit
        ? Math.min(start + filters.limit, maxEnd)
        : maxEnd;

      // Return empty if start is beyond bounds
      if (start >= maxEnd) {
        return {
          auctions: [],
          total: validAuctions.length,
        };
      }

      // Get paginated results
      const paginatedAuctions = validAuctions.slice(start, end);

      return {
        auctions: paginatedAuctions,
        total: validAuctions.length,
      };
    } catch (error) {
      log.error('Error getting auctions:', error as Error);
      return {
        auctions: [],
        total: 0,
      };
    }
  }

  public async getAuctionDetails(auctionAddress: string): Promise<{
    address: string;
    state: anchor.IdlAccounts<SuperpullProgram>['auctionState'];
    currentPrice: number;
  }> {
    try {
      const address = new PublicKey(auctionAddress);
      const state = await this.anchorClient.getAuctionState(address);
      const currentPrice = await this.anchorClient.getCurrentPrice(address);

      return {
        address: auctionAddress,
        state,
        currentPrice: currentPrice.price.toNumber(),
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
        { skipPreflight: false },
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
      log.info('Creating bid transaction', {
        auctionAddress: input.auctionAddress,
        bidderAddress: input.bidderAddress,
        bidAmount: input.bidAmount,
      });
      // Get the auction details
      const auction = await this.getAuctionDetails(input.auctionAddress);
      if (!auction) {
        return {
          success: false,
          message: 'Auction not found',
        };
      }

      // Create a durable nonce transaction
      log.info('Creating durable nonce transaction');
      const { transaction, lastValidBlockHeight } =
        await this.createDurableNonceTransaction(
          new PublicKey(input.bidderAddress),
          async (umi, payer) => {
            const { instruction } = await this.anchorClient.placeBid(
              new PublicKey(input.auctionAddress),
              new PublicKey(input.bidderAddress),
              input.bidAmount,
              umi,
              payer,
              true,
            );
            if (!instruction) {
              throw new Error('Failed to get bid instruction');
            }
            log.info('Got bid instruction', {
              instruction: instruction.toString(),
            });
            return instruction;
          },
        );
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

      return {
        success: true,
        transaction: encodedTransaction,
        lastValidBlockHeight,
      };
    } catch (error) {
      return {
        success: false,
        message: (error as Error).message,
      };
    }
  }

  async submitSignedBidTransaction(signedTransaction: string): Promise<{
    success: boolean;
    message?: string;
    signature?: string;
  }> {
    try {
      // Decode the signed transaction
      const decodedTransaction = Buffer.from(signedTransaction, 'base64');
      const transaction = Transaction.from(decodedTransaction);

      // Submit the transaction
      const signature = await this.sendTransaction(transaction);

      return {
        success: true,
        signature,
      };
    } catch (error) {
      return {
        success: false,
        message: (error as Error).message,
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
}
