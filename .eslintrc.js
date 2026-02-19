module.exports = {
    root: true,
    env: {
        browser: true,
        node: true,
        es2022: true
    },
    extends: [
        'eslint:recommended'
    ],
    parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
    },
    rules: {
        // Erreurs communes
        'no-console': ['warn', { allow: ['warn', 'error'] }],
        'no-unused-vars': ['warn', { 
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_'
        }],
        'no-undef': 'error',
        'no-unreachable': 'error',
        'no-duplicate-imports': 'error',
        
        // Style
        'semi': ['error', 'always'],
        'quotes': ['error', 'single', { avoidEscape: true }],
        'comma-dangle': ['error', 'never'],
        'indent': ['error', 2, { SwitchCase: 1 }],
        'max-len': ['warn', { 
            code: 100, 
            ignoreUrls: true,
            ignoreStrings: true,
            ignoreTemplateLiterals: true
        }],
        
        // Bonnes pratiques
        'eqeqeq': ['error', 'always'],
        'curly': ['error', 'all'],
        'brace-style': ['error', '1tbs'],
        'no-var': 'error',
        'prefer-const': 'error',
        'prefer-arrow-callback': 'warn',
        'arrow-spacing': 'error',
        'object-shorthand': 'warn',
        'prefer-template': 'warn',
        
        // Sécurité
        'no-eval': 'error',
        'no-implied-eval': 'error',
        'no-new-func': 'error',
        'no-script-url': 'error'
    },
    overrides: [
        {
            files: ['**/*.test.js', '**/*.spec.js'],
            env: {
                jest: true
            }
        }
    ],
    ignorePatterns: [
        'node_modules/',
        'dist/',
        'out/',
        'build/',
        '*.min.js',
        'public/lib/**'
    ]
};
