/**
 * Performance Configuration for Production
 * Phase 5: Optimization settings
 */

export const performanceConfig = {
  // Compression settings
  compression: {
    enabled: true,
    threshold: 1024, // Compress responses > 1KB
    encodingPriority: ['br', 'gzip', 'deflate'], // Brotli preferred
    brotli: {
      quality: 4, // 0-11, 4 is good balance
    },
    gzip: {
      level: 6, // 0-9, 6 is good balance
    },
  },

  // Rate limiting
  rateLimit: {
    global: {
      max: 100, // requests
      timeWindow: '1 minute',
    },
    api: {
      max: 50,
      timeWindow: '1 minute',
    },
    auth: {
      max: 5,
      timeWindow: '15 minutes',
    },
  },

  // Caching
  cache: {
    enabled: true,
    ttl: 300, // 5 minutes default
    maxSize: 100, // MB
    endpoints: {
      '/api/users': 60, // 1 minute
      '/api/monitoring': 30, // 30 seconds
      '/api/health': 10, // 10 seconds
    },
  },

  // Request timeouts
  timeouts: {
    request: 30000, // 30s
    idle: 60000, // 1 minute
    keepAlive: 5000, // 5s
  },

  // Connection pooling
  connectionPool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  },
};

export default performanceConfig;
