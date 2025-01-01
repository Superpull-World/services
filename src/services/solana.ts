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
}

export class SolanaService {
  private connection: Connection;
  private payer: Keypair;
  private nftProgramId: PublicKey;

  constructor(
    endpoint: string = process.env.SOLANA_RPC_ENDPOINT ||
      'https://api.devnet.solana.com',
    payerPrivateKey: string = process.env.SOLANA_PRIVATE_KEY!,
    nftProgramId: string = process.env.SUPERPULL_PROGRAM_ID!,
  ) {
    this.connection = new Connection(endpoint, 'confirmed');
    this.payer = Keypair.fromSecretKey(
      Buffer.from(JSON.parse(payerPrivateKey)),
    );
    this.nftProgramId = new PublicKey(nftProgramId);
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
}
