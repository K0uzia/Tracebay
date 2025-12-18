import bcrypt from 'bcryptjs';
import config from '../config/env.js';
/**
 * Hash password using bcrypt
 */
export async function hashPassword(password) {
    return bcrypt.hash(password, config.bcrypt.rounds);
}
/**
 * Compare password with hash
 */
export async function comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
}
//# sourceMappingURL=password.js.map