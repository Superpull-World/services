import jwt from 'jsonwebtoken';

export interface JWTPayload {
  publicKey: string;
  iat: number;
  exp: number;
}

export const verifyJWT = async (token: string): Promise<JWTPayload> => {
  const secretKey = process.env.JWT_SECRET || 'your-secret-key';
  try {
    const decoded = jwt.verify(token, secretKey) as JWTPayload;
    return decoded;
  } catch (_error) {
    throw new Error(`Invalid or expired JWT token, ${_error}`);
  }
};
