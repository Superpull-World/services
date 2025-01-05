import { sign } from 'tweetnacl';
import bs58 from 'bs58';
import jwt from 'jsonwebtoken';

export const generateNonce = async (): Promise<string> => {
  // Generate a random nonce
  const nonce = Buffer.from(
    Array.from({ length: 32 }, () => Math.floor(Math.random() * 256)),
  );
  return bs58.encode(nonce);
};

export const verifySignature = async (
  message: string,
  signature: string,
  publicKey: string,
): Promise<boolean> => {
  try {
    const messageBytes = Buffer.from(message);
    const signatureBytes = bs58.decode(signature);
    const publicKeyBytes = bs58.decode(publicKey);

    return sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
};

export const generateJWT = async (publicKey: string): Promise<string> => {
  const secretKey = process.env.JWT_SECRET || 'your-secret-key';

  return jwt.sign(
    {
      publicKey,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    },
    secretKey,
  );
};

export interface Activities {
  generateNonce: typeof generateNonce;
  verifySignature: typeof verifySignature;
  generateJWT: typeof generateJWT;
}
