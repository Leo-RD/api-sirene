// ==========================================
// AUTHENTIFICATION OAUTH2 / JWT (Keycloak)
// ==========================================
// Keycloak signe les tokens avec sa CLÉ PRIVÉE (RS256).
// Ici on vérifie la signature avec sa CLÉ PUBLIQUE, téléchargée depuis le JWKS.
const { createRemoteJWKSet, jwtVerify } = require('jose');

// Où télécharger les clés publiques (réseau Docker interne : http://keycloak:8080)
const JWKS_URL = process.env.KEYCLOAK_JWKS_URL
  || 'http://localhost:8080/realms/sirene/protocol/openid-connect/certs';
// Émetteur attendu dans le claim "iss" du token
const ISSUER = process.env.KEYCLOAK_ISSUER || 'http://localhost:8080/realms/sirene';

// jose télécharge les clés au premier appel, les met en cache,
// et les re-télécharge tout seul si Keycloak change de clé (rotation).
const JWKS = createRemoteJWKSet(new URL(JWKS_URL));

// Middleware 1 : le token est-il valide ? (sinon 401 Unauthorized)
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Token manquant (header Authorization: Bearer <token>)' });
  }

  try {
    // Vérifie : signature RSA, algorithme, émetteur, expiration
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: ISSUER,
      algorithms: ['RS256'],
    });
    req.user = payload; // on garde le contenu du token pour la suite
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token invalide', detail: err.code || err.message });
  }
}

// Middleware 2 : l'utilisateur a-t-il le bon rôle ? (sinon 403 Forbidden)
function requireRole(role) {
  return (req, res, next) => {
    const roles = req.user?.realm_access?.roles || [];
    if (!roles.includes(role)) {
      return res.status(403).json({ message: `Rôle requis : ${role}` });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
