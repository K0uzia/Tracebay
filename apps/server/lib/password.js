const bcrypt = require('bcrypt');

/**
 * Hasher un mot de passe
 */
async function hashPassword(password) {
    try {
        const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS || 10));
        return await bcrypt.hash(password, salt);
    } catch (error) {
        console.error('❌ Erreur hash password:', error.message);
        throw error;
    }
}

/**
 * Comparer un mot de passe avec son hash
 */
async function comparePassword(password, hash) {
    try {
        return await bcrypt.compare(password, hash);
    } catch (error) {
        console.error('❌ Erreur compare password:', error.message);
        throw error;
    }
}

module.exports = {
    hashPassword,
    comparePassword
};
