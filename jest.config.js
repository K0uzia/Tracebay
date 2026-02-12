module.exports = {
    testEnvironment: 'jsdom',
    roots: ['<rootDir>/apps/client'],
    testMatch: [
        '**/__tests__/**/*.js',
        '**/?(*.)+(spec|test).js'
    ],
    collectCoverageFrom: [
        'apps/client/public/assets/js/**/*.js',
        '!apps/client/public/assets/js/**/*.test.js',
        '!apps/client/public/assets/js/**/*.spec.js',
        '!apps/client/public/lib/**',
        '!**/node_modules/**'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    coverageThreshold: {
        global: {
            branches: 50,
            functions: 50,
            lines: 50,
            statements: 50
        }
    },
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/apps/client/public/assets/js/$1'
    },
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    testTimeout: 10000,
    transform: {
        '^.+\\.js$': ['babel-jest', {
            presets: [['@babel/preset-env', {
                targets: { node: 'current' },
                modules: 'commonjs'
            }]]
        }]
    },
    transformIgnorePatterns: [
        'node_modules/(?!(.*\\.mjs$))'
    ]
};
