import jwt from 'jsonwebtoken';
import config from '../config/env.js';

interface JwtPayload {
  userId: number;
  username: string;
}

/**
 * Generate JWT token
 */
export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiry,
  } as jwt.SignOptions);
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, config.jwt.secret) as JwtPayload;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}
