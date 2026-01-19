/**
 * Security Configuration
 * Phase 5: Security hardening settings
 */

export const securityConfig = {
  // JWT settings
  jwt: {
    secret: process.env.JWT_SECRET || 'SECRET_RETIRE',
    expiresIn: '24h',
    refreshExpiresIn: '7d',
  },

  // Password requirements
  password: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
  },

  // Session settings
  session: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict' as const,
  },

  // Rate limiting (auth-specific)
  authRateLimit: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    blockDuration: 60 * 60 * 1000, // 1 hour
  },

  // CORS settings
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
    optionsSuccessStatus: 200,
  },

  // Helmet settings (security headers)
  helmet: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  },

  // Secrets management
  secrets: {
    rotationInterval: 90 * 24 * 60 * 60 * 1000, // 90 days
    algorithm: 'aes-256-gcm',
  },
};

export default securityConfig;
