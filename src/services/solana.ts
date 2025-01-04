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
    this.connection = new Connection(endpoint, 'confirmed');
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
      { commitment: 'confirmed' },
    );
    log.info('Initializing Anchor client', {
      provider,
    });
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

      const ownerPublicKey = new PublicKey(ownerAddress);

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
        leafOwner: ownerPublicKey.toBase58(),
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
            uri: metadata.image,
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

      const result = await nftBuilder.sendAndConfirm(this.umi);
      const txId = result.signature.toString();

      const assetId = await this.computeAssetId(
        merkleTreeKeypair.publicKey.toString(),
        ownerPublicKey.toBase58(),
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
    const { items } = await this.umi.rpc.getAssetsByOwner({
      owner: publicKey(owner),
      sortBy: { sortBy: 'created', sortDirection: 'desc' },
    });

    const asset = items.find((item) => item.compression.tree === tree);

    if (!asset) {
      throw new Error('Asset not found');
    }

    return asset.id;
  }

  async initializeAuction(
    tokenId: string,
    merkleTree: PublicKey,
    bondingCurve: BondingCurveParams,
    ownerAddress: string,
  ): Promise<{ auctionAddress: PublicKey; txId: string }> {
    try {
      const ownerPublicKey = new PublicKey(ownerAddress);

      const result = await this.anchorClient.initializeAuction(
        merkleTree,
        ownerPublicKey,
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
}
