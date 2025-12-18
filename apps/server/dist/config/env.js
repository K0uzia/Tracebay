import dotenv from 'dotenv';
dotenv.config();
const config = {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '8060', 10),
    database: {
        path: process.env.DATABASE_PATH || './data/database.sqlite',
        poolSize: parseInt(process.env.DB_POOL_SIZE || '5', 10),
        poolTimeout: parseInt(process.env.DB_POOL_TIMEOUT || '10000', 10),
    },
    jwt: {
        secret: process.env.JWT_SECRET ||
            (process.env.NODE_ENV === 'production'
                ? (() => {
                    throw new Error('JWT_SECRET required in production');
                })()
                : 'dev-secret'),
        expiry: process.env.JWT_EXPIRY || '7d',
    },
    bcrypt: {
        rounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    },
    features: {
        chat: process.env.ENABLE_CHAT === 'true',
        monitoring: process.env.ENABLE_MONITORING === 'true',
        debug: process.env.ENABLE_DEBUG === 'true',
    },
    logging: {
        level: process.env.LOG_LEVEL || 'info',
    },
};
export default config;
//# sourceMappingURL=env.js.map