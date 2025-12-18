interface JwtPayload {
    userId: number;
    username: string;
}
/**
 * Generate JWT token
 */
export declare function generateToken(payload: JwtPayload): string;
/**
 * Verify JWT token
 */
export declare function verifyToken(token: string): JwtPayload;
export {};
