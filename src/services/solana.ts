import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
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
} from '@metaplex-foundation/mpl-bubblegum';
import {
  keypairIdentity,
  Umi,
  publicKey,
  transactionBuilder,
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
}

export class SolanaService {
  private connection: Connection;
  private payer: Keypair;
  private nftProgramId: PublicKey;
  private merkleTree: PublicKey;
  private umi: Umi;
  private collectionMint: PublicKey;
  private anchorClient: AnchorClient;

  constructor(
    endpoint: string = process.env.SOLANA_RPC_ENDPOINT ||
      'https://api.devnet.solana.com',
    payerPrivateKey: string = process.env.SOLANA_PRIVATE_KEY!,
    nftProgramId: string = process.env.SUPERPULL_PROGRAM_ID!,
    merkleTree: string = process.env.MERKLE_TREE!,
    collectionMint: string = process.env.COLLECTION_MINT!,
  ) {
    this.connection = new Connection(endpoint, 'confirmed');
    this.payer = Keypair.fromSecretKey(
      Buffer.from(JSON.parse(payerPrivateKey)),
    );
    this.nftProgramId = new PublicKey(nftProgramId);
    this.merkleTree = new PublicKey(merkleTree);
    this.collectionMint = new PublicKey(collectionMint);

    this.umi = createUmi(endpoint)
      .use(keypairIdentity(fromWeb3JsKeypair(this.payer)))
      .use(mplBubblegum())
      .use(dasApi());

    // Initialize Anchor client
    const provider = new anchor.AnchorProvider(
      this.connection,
      new anchor.Wallet(this.payer),
      { commitment: 'confirmed' },
    );
    this.anchorClient = new AnchorClient(provider, this.nftProgramId);
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
        this.nftProgramId,
      );

      // Initialize NFT with bonding curve parameters
      const transaction = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: this.payer.publicKey,
          newAccountPubkey: nftStateAccount,
          lamports:
            await this.connection.getMinimumBalanceForRentExemption(1000),
          space: 1000,
          programId: this.nftProgramId,
        }),
        {
          keys: [
            { pubkey: nftStateAccount, isSigner: false, isWritable: true },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: this.payer.publicKey, isSigner: true, isWritable: true },
          ],
          programId: this.nftProgramId,
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
        this.nftProgramId,
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
        programId: this.nftProgramId,
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
        this.nftProgramId,
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
  ): Promise<{ mint: PublicKey; txId: string }> {
    try {
      const ownerPublicKey = new PublicKey(ownerAddress);

      const builder = transactionBuilder().add(
        mintToCollectionV1(this.umi, {
          leafOwner: fromWeb3JsPublicKey(ownerPublicKey),
          merkleTree: fromWeb3JsPublicKey(this.merkleTree),
          collectionMint: fromWeb3JsPublicKey(this.collectionMint),
          metadata: {
            name: metadata.name,
            symbol: metadata.symbol,
            uri: metadata.image,
            sellerFeeBasisPoints: 0,
            collection: {
              key: fromWeb3JsPublicKey(this.collectionMint),
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

      const { signature } = await builder.sendAndConfirm(this.umi);
      const txId = signature.toString();

      const assetId = await this.computeAssetId(
        this.merkleTree.toBase58(),
        ownerPublicKey.toBase58(),
      );

      return {
        mint: new PublicKey(assetId),
        txId,
      };
    } catch (error) {
      console.error('Error creating compressed NFT:', error);
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
    bondingCurve: BondingCurveParams,
    ownerAddress: string,
  ): Promise<{ auctionAddress: PublicKey; txId: string }> {
    try {
      const ownerPublicKey = new PublicKey(ownerAddress);

      const result = await this.anchorClient.initializeAuction(
        this.merkleTree,
        ownerPublicKey,
        bondingCurve.initialPrice,
        bondingCurve.slope,
        bondingCurve.maxSupply,
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
}
