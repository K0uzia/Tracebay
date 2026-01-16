const jwt = require('jsonwebtoken');

/**
 * Middleware d'authentification JWT
 * Vérifie le token Bearer dans les headers Authorization
 */
function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Token requis'
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');

    req.user = decoded;
    next();
  } catch (error) {
    console.error('❌ Erreur vérification token:', error.message);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expiré'
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Token invalide'
    });
  }
}

/**
 * Middleware optionnel d'authentification
 * N'échoue pas si pas de token, mais définit req.user si présent
 */
function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
      req.user = decoded;
    }

    next();
  } catch (error) {
    // Silencieusement ignorer les erreurs de token optionnel
    next();
  }
}

module.exports = {
  verifyToken,
  optionalAuth
};
