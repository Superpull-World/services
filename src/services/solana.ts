import * as anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createTree, mplBubblegum } from '@metaplex-foundation/mpl-bubblegum';
import {
  createNft,
  mplTokenMetadata,
  findCollectionAuthorityRecordPda,
  approveCollectionAuthority,
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

import { AnchorClient } from './anchor-client';
import { SuperpullProgram } from '../types/superpull_program';

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

  private async initializeCollectionOnStartup(): Promise<void> {
    try {
      log.info('Checking for collection mint', {
        collectionAddress: this.collectionMint.publicKey.toString(),
      });

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

        log.info('Collection mint created', {
          collectionMint: this.collectionMint.publicKey.toString(),
        });
      } else {
        log.info('Collection mint already exists', {
          collectionMint: this.collectionMint.publicKey.toString(),
        });
      }
    } catch (error) {
      log.error('Error initializing collection:', error as Error);
      throw error;
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

  public async placeBid(
    auctionAddress: PublicKey,
    bidderAddress: string,
    bidAmount: number,
  ): Promise<{ txId: string }> {
    try {
      const result = await this.anchorClient.placeBid(
        auctionAddress,
        new PublicKey(bidderAddress),
        bidAmount,
      );

      return {
        txId: result,
      };
    } catch (error) {
      log.error('Error placing bid:', error as Error);
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
      if (filters.isGraduated !== undefined) {
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

      // Apply pagination
      const start = Math.max(0, filters.offset || 0);
      const maxEnd = accounts.length;
      const end = filters.limit
        ? Math.min(start + filters.limit, maxEnd)
        : maxEnd;

      // Return empty if start is beyond bounds
      if (start >= maxEnd) {
        return {
          auctions: [],
          total: accounts.length,
        };
      }

      // Get paginated accounts
      const paginatedAccounts = accounts.slice(start, end);

      // Fetch full account data for paginated accounts
      const auctionDetails = await Promise.all(
        paginatedAccounts.map(async (account) => {
          try {
            const accountInfo = await this.connection.getAccountInfo(
              account.pubkey,
              'confirmed',
            );
            if (!accountInfo) {
              return null;
            }

            const state = this.anchorClient.program.coder.accounts.decode(
              'auctionState',
              accountInfo.data,
            );

            return {
              address: account.pubkey.toString(),
              state,
            };
          } catch (error) {
            log.warn('Error decoding auction account', {
              account: account.pubkey.toString(),
              error,
            });
            return null;
          }
        }),
      );

      // Filter out any null results from failed decoding
      const validAuctions = auctionDetails.filter(
        (auction): auction is NonNullable<typeof auction> => auction !== null,
      );

      return {
        auctions: validAuctions,
        total: accounts.length,
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
}
