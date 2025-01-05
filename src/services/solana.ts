import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { log } from '@temporalio/activity';

import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from '@solana/spl-token';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { dasApi } from '@metaplex-foundation/digital-asset-standard-api';
import {
  mplBubblegum,
  mintToCollectionV1,
  createTree,
} from '@metaplex-foundation/mpl-bubblegum';
import {
  createNft,
  mplTokenMetadata,
} from '@metaplex-foundation/mpl-token-metadata';
import {
  keypairIdentity,
  Umi,
  publicKey,
  transactionBuilder,
  generateSigner,
  percentAmount,
  createSignerFromKeypair,
} from '@metaplex-foundation/umi';
import {
  fromWeb3JsKeypair,
  fromWeb3JsPublicKey,
} from '@metaplex-foundation/umi-web3js-adapters';
import * as anchor from '@coral-xyz/anchor';
import { AnchorClient } from './anchor-client';
import { AuctionDetails } from './types';
import bs58 from 'bs58';

export interface NFTMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
  properties?: {
    files?: Array<{
      uri: string;
      type: string;
    }>;
  };
}

export interface BondingCurveParams {
  initialPrice: number;
  slope: number;
  minimumPurchase: number;
  maxSupply: number;
  minimumItems: number;
}

export interface AuctionQueryParams {
  merkleTree?: string;
  authority?: string;
  isGraduated?: boolean;
  limit?: number;
  offset?: number;
}

export interface AuctionQueryResult {
  auctions: Array<{
    auctionAddress: string;
    tokenId: string;
    currentPrice: number;
    highestBidder: string;
    endTime: number;
    status: 'active' | 'ended' | 'cancelled';
    ownerAddress: string;
    minimumBid: number;
  }>;
  total: number;
}

export class SolanaService {
  private connection: Connection;
  private payer: Keypair;
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
      .use(dasApi())
      .use(mplTokenMetadata());

    // Initialize Anchor client
    const provider = new anchor.AnchorProvider(
      this.connection,
      new anchor.Wallet(this.payer),
      { commitment: 'confirmed', skipPreflight: true },
    );
    this.anchorClient = new AnchorClient(provider);
  }

  public async initializeCollection(): Promise<void> {
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
          name: 'SuperPull Collection',
          symbol: 'SPULL',
          uri: 'https://assets.superpull.world/collection.json',
          sellerFeeBasisPoints: percentAmount(0),
          isCollection: true,
          creators: null,
          collection: null,
          uses: null,
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
      console.error('Error initializing collection:', error);
      throw error;
    }
  }

  async createNFTWithBondingCurve(
    metadata: NFTMetadata,
    bondingCurve: BondingCurveParams,
    ownerAddress: string,
  ): Promise<{ mint: PublicKey; txId: string }> {
    try {
      // Create the mint account
      const mint = await createMint(
        this.connection,
        this.payer,
        this.payer.publicKey,
        this.payer.publicKey,
        0,
      );

      // Create the token account for the owner
      const ownerPublicKey = new PublicKey(ownerAddress);
      const tokenAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.payer,
        mint,
        ownerPublicKey,
      );

      // Mint initial token
      await mintTo(
        this.connection,
        this.payer,
        mint,
        tokenAccount.address,
        this.payer,
        1,
      );

      // Create the NFT state account
      const [nftStateAccount] = await PublicKey.findProgramAddress(
        [Buffer.from('nft_state'), mint.toBuffer()],
        new PublicKey(this.anchorClient.program.idl.address),
      );

      // Initialize NFT with bonding curve parameters
      const transaction = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: this.payer.publicKey,
          newAccountPubkey: nftStateAccount,
          lamports:
            await this.connection.getMinimumBalanceForRentExemption(1000),
          space: 1000,
          programId: new PublicKey(this.anchorClient.program.idl.address),
        }),
        {
          keys: [
            { pubkey: nftStateAccount, isSigner: false, isWritable: true },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: this.payer.publicKey, isSigner: true, isWritable: true },
          ],
          programId: new PublicKey(this.anchorClient.program.idl.address),
          data: Buffer.from(
            JSON.stringify({
              instruction: 'initialize_nft',
              metadata,
              bondingCurve,
            }),
          ),
        },
      );

      const txId = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.payer],
      );

      return {
        mint,
        txId,
      };
    } catch (error) {
      console.error('Error creating NFT with bonding curve:', error);
      throw error;
    }
  }

  async purchaseNFTEdition(
    mint: PublicKey,
    buyerAddress: string,
    quantity: number = 1,
  ): Promise<string> {
    try {
      const buyerPublicKey = new PublicKey(buyerAddress);

      // Get the NFT state account
      const [nftStateAccount] = await PublicKey.findProgramAddress(
        [Buffer.from('nft_state'), mint.toBuffer()],
        new PublicKey(this.anchorClient.program.idl.address),
      );

      // Create buyer's token account if it doesn't exist
      const buyerTokenAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.payer,
        mint,
        buyerPublicKey,
      );

      // Create the purchase transaction
      const transaction = new Transaction().add({
        keys: [
          { pubkey: nftStateAccount, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: true },
          {
            pubkey: buyerTokenAccount.address,
            isSigner: false,
            isWritable: true,
          },
          { pubkey: buyerPublicKey, isSigner: true, isWritable: true },
          { pubkey: this.payer.publicKey, isSigner: true, isWritable: true },
        ],
        programId: new PublicKey(this.anchorClient.program.idl.address),
        data: Buffer.from(
          JSON.stringify({
            instruction: 'purchase_edition',
            quantity,
          }),
        ),
      });

      const txId = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.payer],
      );

      return txId;
    } catch (error) {
      console.error('Error purchasing NFT edition:', error);
      throw error;
    }
  }

  async getCurrentPrice(mint: PublicKey): Promise<number> {
    try {
      const [nftStateAccount] = await PublicKey.findProgramAddress(
        [Buffer.from('nft_state'), mint.toBuffer()],
        new PublicKey(this.anchorClient.program.idl.address),
      );

      const accountInfo = await this.connection.getAccountInfo(nftStateAccount);
      if (!accountInfo) {
        throw new Error('NFT state account not found');
      }

      const state = JSON.parse(accountInfo.data.toString());
      return state.currentPrice;
    } catch (error) {
      console.error('Error getting current NFT price:', error);
      throw error;
    }
  }

  async createCompressedNFT(
    metadata: NFTMetadata,
    ownerAddress: string,
  ): Promise<{ mint: PublicKey; txId: string; merkleTree: PublicKey }> {
    try {
      log.info('Starting compressed NFT creation', {
        owner: ownerAddress,
        metadata: metadata.name,
      });

      // Generate a new signer for the tree
      const merkleTreeKeypair = generateSigner(this.umi);
      const merkleTreeDepth = 14;
      const merkleTreeBufferSize = 64;

      log.debug('Creating Merkle tree', {
        maxDepth: merkleTreeDepth.toString(),
        maxBufferSize: merkleTreeBufferSize.toString(),
      });

      // Create the tree with default parameters for compressed NFTs
      const treeBuilder = createTree(this.umi, {
        merkleTree: merkleTreeKeypair,
        maxDepth: merkleTreeDepth,
        maxBufferSize: merkleTreeBufferSize,
        public: true,
      });

      // Send and confirm the tree creation
      await (await treeBuilder).sendAndConfirm(this.umi);

      log.info('Merkle tree created', {
        treeAddress: merkleTreeKeypair.publicKey.toString(),
        leafOwner: this.payer.publicKey.toBase58(),
        collectionMint: this.collectionMint.publicKey.toString(),
        payer: this.payer.publicKey.toBase58(),
      });

      // Create the NFT using the new tree
      const nftBuilder = transactionBuilder().add(
        mintToCollectionV1(this.umi, {
          leafOwner: fromWeb3JsPublicKey(this.payer.publicKey),
          merkleTree: merkleTreeKeypair.publicKey,
          collectionMint: fromWeb3JsPublicKey(this.collectionMint.publicKey),
          metadata: {
            name: metadata.name,
            symbol: metadata.symbol,
            uri: 'https://assets.superpull.world/collection.json',
            sellerFeeBasisPoints: 0,
            collection: {
              key: fromWeb3JsPublicKey(this.collectionMint.publicKey),
              verified: true,
            },
            creators: [
              {
                address: fromWeb3JsPublicKey(this.payer.publicKey),
                verified: true,
                share: 100,
              },
            ],
          },
        }),
      );

      const result = await nftBuilder.send(this.umi, {
        commitment: 'confirmed',
        skipPreflight: true,
      });
      const txId = result.toString();
      log.info('Transaction sent', { txId });

      const assetId = await this.computeAssetId(
        merkleTreeKeypair.publicKey.toString(),
        this.payer.publicKey.toBase58(),
      );

      const response = {
        mint: new PublicKey(assetId),
        txId,
        merkleTree: new PublicKey(merkleTreeKeypair.publicKey),
      };

      log.debug('Compressed NFT created successfully', {
        assetId,
        txId,
        merkleTree: merkleTreeKeypair.publicKey.toString(),
      });

      return response;
    } catch (error) {
      log.error('Error creating compressed NFT', {
        error,
        owner: ownerAddress,
        metadata: metadata.name,
      });
      throw error;
    }
  }

  private async computeAssetId(tree: string, owner: string): Promise<string> {
    const maxRetries = 5;
    const retryDelay = 2000; // 2 seconds

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        log.info('Fetching assets by owner', {
          owner,
          attempt: attempt + 1,
          maxRetries,
        });

        const { items } = await this.umi.rpc.getAssetsByOwner({
          owner: publicKey(owner),
          sortBy: { sortBy: 'created', sortDirection: 'desc' },
        });

        log.info('Found assets', {
          totalAssets: items.length,
          assets: items.map((item) => ({
            id: item.id,
            tree: item.compression.tree,
            leaf_id: item.compression.leaf_id,
          })),
        });

        const treePublicKey = fromWeb3JsPublicKey(new PublicKey(tree));
        log.info('Looking for asset in tree', {
          searchTree: treePublicKey,
          treeString: tree,
        });

        const asset = items.find(
          (item) => item.compression.tree === treePublicKey,
        );

        if (asset) {
          log.info('Asset found', {
            assetId: asset.id,
            tree: asset.compression.tree,
            leaf_id: asset.compression.leaf_id,
          });
          return asset.id;
        }

        log.info('Asset not found in current attempt, retrying...', {
          attempt: attempt + 1,
          maxRetries,
        });

        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      } catch (error) {
        log.error('Error in computeAssetId attempt', {
          attempt: attempt + 1,
          error,
        });

        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }
    }

    throw new Error(`Asset not found after ${maxRetries} attempts`);
  }

  async initializeAuction(
    merkleTree: PublicKey,
    bondingCurve: BondingCurveParams,
  ): Promise<{ auctionAddress: PublicKey; txId: string }> {
    try {
      const result = await this.anchorClient.initializeAuction(
        merkleTree,
        this.payer.publicKey,
        bondingCurve.initialPrice,
        bondingCurve.slope,
        bondingCurve.maxSupply,
        bondingCurve.minimumItems,
      );

      return {
        auctionAddress: result.auctionAddress,
        txId: result.signature,
      };
    } catch (error) {
      console.error('Error initializing auction:', error);
      throw error;
    }
  }

  async placeBid(
    auctionAddress: PublicKey,
    bidderAddress: string,
    bidAmount: number,
  ): Promise<{ txId: string }> {
    log.info('Placing bid on auction', {
      auctionAddress: auctionAddress.toString(),
      bidderAddress,
      bidAmount,
    });

    const LAMPORTS_PER_SOL = 1_000_000_000; // 1 SOL = 1 billion lamports
    const bidAmountLamports = Math.floor(bidAmount * LAMPORTS_PER_SOL);

    const bidderPublicKey = new PublicKey(bidderAddress);
    const signature = await this.anchorClient.placeBid(
      auctionAddress,
      bidderPublicKey,
      bidAmountLamports,
    );

    return {
      txId: signature,
    };
  }

  async getAuctions(
    params: AuctionQueryParams,
  ): Promise<{ auctions: AuctionDetails[]; total: number }> {
    try {
      const program = this.anchorClient.program;

      // Convert discriminator to base58
      const discriminator = Buffer.from([252, 227, 205, 147, 72, 64, 250, 126]);
      const filters = [
        {
          memcmp: {
            offset: 0,
            bytes: bs58.encode(discriminator),
          },
        },
      ];

      if (params.merkleTree) {
        try {
          const merkleTreePubkey = new PublicKey(params.merkleTree);
          filters.push({
            memcmp: {
              offset: 8 + 32, // discriminator + authority
              bytes: merkleTreePubkey.toBase58(),
            },
          });
        } catch (e) {
          log.error('Invalid merkle tree public key', { error: e });
        }
      }

      if (params.authority) {
        try {
          const authorityPubkey = new PublicKey(params.authority);
          filters.push({
            memcmp: {
              offset: 8, // discriminator
              bytes: authorityPubkey.toBase58(),
            },
          });
        } catch (e) {
          log.error('Invalid authority public key', { error: e });
        }
      }

      if (params.isGraduated !== undefined) {
        filters.push({
          memcmp: {
            offset: 8 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 8, // All fields before isGraduated
            bytes: bs58.encode(Buffer.from([params.isGraduated ? 1 : 0])),
          },
        });
      }

      log.info('Fetching auction accounts with filters', {
        filters,
        programId: program.programId.toString(),
        discriminator: discriminator.toString('hex'),
        discriminatorBase58: bs58.encode(discriminator),
      });

      // First try to get all accounts for the program
      const allAccounts = await this.connection.getProgramAccounts(
        program.programId,
        { filters },
      );

      log.info('All program accounts', {
        count: allAccounts.length,
        accounts: allAccounts.map((a) => ({
          pubkey: a.pubkey.toString(),
          dataLength: a.account.data.length,
          discriminator: a.account.data.slice(0, 8).toString('hex'),
        })),
      });

      const auctions = await program.account.auctionState.all(filters);

      log.info('Found auction accounts', {
        count: auctions.length,
        auctions: auctions.map((a) => ({
          address: a.publicKey.toString(),
          authority: a.account.authority.toString(),
          merkleTree: a.account.merkleTree.toString(),
        })),
      });

      const auctionDetails = await Promise.all(
        auctions
          .slice(
            params.offset || 0,
            (params.offset || 0) + (params.limit || 10),
          )
          .map(async ({ publicKey, account }) => {
            const currentPrice =
              account.basePrice.toNumber() +
              account.priceIncrement.toNumber() *
                account.currentSupply.toNumber();

            // Fetch NFT metadata from the merkle tree
            const { items } = await this.umi.rpc.getAssetsByOwner({
              owner: fromWeb3JsPublicKey(account.merkleTree),
              sortBy: { sortBy: 'created', sortDirection: 'desc' },
              limit: 1,
            });

            // Get the JSON metadata from the asset
            let nftMetadata = {
              name: `SuperPull NFT #${account.currentSupply.toNumber() + 1}`,
              symbol: 'SPULL',
              description: 'A unique SuperPull NFT with bonding curve pricing',
              uri: 'https://assets.superpull.world/placeholder.png',
            };

            if (items.length > 0 && items[0].content.metadata?.uri) {
              try {
                const response = await fetch(items[0].content.metadata.uri as string);
                if (response.ok) {
                  const metadata = (await response.json()) as NFTMetadata;
                  nftMetadata = {
                    name: metadata.name || nftMetadata.name,
                    symbol: metadata.symbol || nftMetadata.symbol,
                    description: metadata.description || nftMetadata.description,
                    uri: metadata.image || nftMetadata.uri,
                  };
                }
              } catch (error) {
                log.error('Failed to fetch NFT metadata', {
                  error,
                  uri: items[0].content.metadata.uri,
                });
              }
            }

            return {
              address: publicKey.toString(),
              name: nftMetadata.name,
              description: nftMetadata.description,
              imageUrl: nftMetadata.uri,
              authority: account.authority.toString(),
              merkleTree: account.merkleTree.toString(),
              basePrice: account.basePrice.toNumber() / 1e9,
              priceIncrement: account.priceIncrement.toNumber() / 1e9,
              currentSupply: account.currentSupply.toNumber(),
              maxSupply: account.maxSupply.toNumber(),
              minimumItems: account.minimumItems.toNumber(),
              totalValueLocked: account.totalValueLocked.toNumber() / 1e9,
              currentPrice: currentPrice / 1e9,
              isGraduated: account.isGraduated,
              status: account.isGraduated ? 'Graduated' : 'Active',
              progressPercentage:
                account.currentSupply.toNumber() /
                account.minimumItems.toNumber(),
            };
          }),
      );

      return {
        auctions: auctionDetails,
        total: auctions.length,
      };
    } catch (error) {
      log.error('Failed to fetch auctions', { error });
      return {
        auctions: [],
        total: 0,
      };
    }
  }

  async getAuctionDetails(
    auctionAddress: string,
  ): Promise<AuctionDetails | null> {
    try {
      const program = this.anchorClient.program;
      const auctionPubkey = new PublicKey(auctionAddress);
      const account = await program.account.auctionState.fetch(auctionPubkey);

      if (!account) return null;

      const currentPrice =
        account.basePrice.toNumber() +
        account.priceIncrement.toNumber() * account.currentSupply.toNumber();

      return {
        address: auctionAddress,
        name: `SuperPull NFT #${account.currentSupply.toNumber() + 1}`,
        description: 'A unique SuperPull NFT with bonding curve pricing',
        imageUrl: 'https://assets.superpull.world/placeholder.png',
        authority: account.authority.toString(),
        merkleTree: account.merkleTree.toString(),
        basePrice: account.basePrice.toNumber() / 1e9, // Convert from lamports to SOL
        priceIncrement: account.priceIncrement.toNumber() / 1e9, // Convert from lamports to SOL
        currentSupply: account.currentSupply.toNumber(),
        maxSupply: account.maxSupply.toNumber(),
        totalValueLocked: account.totalValueLocked.toNumber() / 1e9, // Convert from lamports to SOL
        minimumItems: account.minimumItems.toNumber(),
        isGraduated: account.isGraduated,
        currentPrice: currentPrice / 1e9, // Convert from lamports to SOL
      };
    } catch (error) {
      log.error('Failed to fetch auction details', { error });
      return null;
    }
  }
}
