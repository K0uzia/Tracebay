import jwt from 'jsonwebtoken';
import config from '../config/env.js';
/**
 * Generate JWT token
 */
export function generateToken(payload) {
    return jwt.sign(payload, config.jwt.secret, {
        expiresIn: config.jwt.expiry,
    });
}
/**
 * Verify JWT token
 */
export function verifyToken(token) {
    try {
        return jwt.verify(token, config.jwt.secret);
    }
    catch (error) {
        throw new Error('Invalid or expired token');
    }
}
//# sourceMappingURL=jwt.js.map