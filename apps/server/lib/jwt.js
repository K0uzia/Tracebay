const jwt = require('jsonwebtoken');

/**
 * Générer un token JWT
 */
function generateToken(user) {
    const secret = process.env.JWT_SECRET || 'secret';
    const expiresIn = process.env.JWT_EXPIRATION || '7d';
    
    return jwt.sign(
        {
            id: user.id,
            username: user.username
        },
        secret,
        { expiresIn }
    );
}

/**
 * Vérifier un token JWT
 */
function verifyToken(token) {
    try {
        const secret = process.env.JWT_SECRET || 'secret';
        return jwt.verify(token, secret);
    } catch (error) {
        console.error('❌ Erreur vérification token:', error.message);
        throw error;
    }
}

/**
 * Décoder un token sans vérification
 */
function decodeToken(token) {
    try {
        return jwt.decode(token);
    } catch (error) {
        return null;
    }
}

module.exports = {
    generateToken,
    verifyToken,
    decodeToken
};
