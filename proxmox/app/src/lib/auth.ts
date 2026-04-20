import * as crypto from 'crypto';

/**
 * JWT Token Management
 */
export class TokenManager {
  private secret: string;
  private expiresIn: number;

  constructor(secret: string = 'SECRET_RETIRE', expiresInHours: number = 24) {
    this.secret = secret;
    this.expiresIn = expiresInHours * 60 * 60 * 1000;
  }

  /**
   * Generate JWT token (mock implementation)
   */
  generateToken(payload: any): string {
    // Mock JWT generation - in production use jsonwebtoken
    const header = Buffer.from(JSON.stringify({
      alg: 'HS256',
      typ: 'JWT'
    })).toString('base64');

    const body = Buffer.from(JSON.stringify({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor((Date.now() + this.expiresIn) / 1000)
    })).toString('base64');

    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(`${header}.${body}`)
      .digest('base64');

    return `${header}.${body}.${signature}`;
  }

  /**
   * Verify JWT token (mock implementation)
   */
  verifyToken(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid token format');
      }

      const [header, body, signature] = parts;

      // Verify signature
      const expectedSignature = crypto
        .createHmac('sha256', this.secret)
        .update(`${header}.${body}`)
        .digest('base64');

      if (signature !== expectedSignature) {
        throw new Error('Invalid signature');
      }

      const payload = JSON.parse(Buffer.from(body, 'base64').toString());

      // Check expiration
      if (payload.exp < Math.floor(Date.now() / 1000)) {
        throw new Error('Token expired');
      }

      return payload;
    } catch (error) {
      throw new Error(`Invalid token: ${(error as any).message}`);
    }
  }

  /**
   * Decode token without verification
   */
  decodeToken(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid token format');
      }

      return JSON.parse(Buffer.from(parts[1], 'base64').toString());
    } catch (error) {
      throw new Error('Failed to decode token');
    }
  }

  /**
   * Refresh token
   */
  refreshToken(token: string): string {
    const payload = this.verifyToken(token);
    delete payload.iat;
    delete payload.exp;
    return this.generateToken(payload);
  }
}

/**
 * Password hashing
 */
export class PasswordManager {
  /**
   * Hash password (mock implementation)
   * In production, use bcryptjs
   */
  static hashPassword(password: string): string {
    return crypto
      .createHash('sha256')
      .update(password + 'workspace-salt')
      .digest('hex');
  }

  /**
   * Verify password
   */
  static verifyPassword(password: string, hash: string): boolean {
    return this.hashPassword(password) === hash;
  }

  /**
   * Generate random password
   */
  static generateRandomPassword(length: number = 12): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}

/**
 * Session Management
 */
export class SessionManager {
  private sessions: Map<string, any> = new Map();
  private sessionTimeout: number;

  constructor(timeoutMinutes: number = 30) {
    this.sessionTimeout = timeoutMinutes * 60 * 1000;
  }

  /**
   * Create session
   */
  createSession(userId: string, data: any): string {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const session = {
      userId,
      data,
      createdAt: new Date(),
      lastActivity: new Date(),
      expiresAt: new Date(Date.now() + this.sessionTimeout)
    };

    this.sessions.set(sessionId, session);

    // Auto-cleanup expired sessions
    this.cleanupExpiredSessions();

    return sessionId;
  }

  /**
   * Verify session
   */
  verifySession(sessionId: string): any {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error('Session not found');
    }

    if (new Date() > session.expiresAt) {
      this.sessions.delete(sessionId);
      throw new Error('Session expired');
    }

    session.lastActivity = new Date();
    return session;
  }

  /**
   * Destroy session
   */
  destroySession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Cleanup expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = new Date();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(sessionId);
      }
    }
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }
}

/**
 * API Key Management
 */
export class ApiKeyManager {
  private apiKeys: Map<string, any> = new Map();

  /**
   * Generate API key
   */
  generateApiKey(userId: string, description: string = ''): string {
    const key = `workspace_${crypto.randomBytes(32).toString('hex')}`;
    const hash = crypto.createHash('sha256').update(key).digest('hex');

    this.apiKeys.set(hash, {
      userId,
      description,
      createdAt: new Date(),
      lastUsedAt: null,
      isActive: true
    });

    return key;
  }

  /**
   * Verify API key
   */
  verifyApiKey(key: string): any {
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    const apiKey = this.apiKeys.get(hash);

    if (!apiKey || !apiKey.isActive) {
      throw new Error('Invalid API key');
    }

    apiKey.lastUsedAt = new Date();
    return apiKey;
  }

  /**
   * Revoke API key
   */
  revokeApiKey(key: string): void {
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    const apiKey = this.apiKeys.get(hash);

    if (apiKey) {
      apiKey.isActive = false;
    }
  }
}
