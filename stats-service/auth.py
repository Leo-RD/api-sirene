# ==========================================
# AUTHENTIFICATION OAUTH2 / JWT (Keycloak)
# ==========================================
# Même principe que auth.js : on vérifie la signature RS256
# avec la CLÉ PUBLIQUE de Keycloak (JWKS).
import os

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

JWKS_URL = os.getenv(
    "KEYCLOAK_JWKS_URL",
    "http://localhost:8080/realms/sirene/protocol/openid-connect/certs",
)
ISSUER = os.getenv("KEYCLOAK_ISSUER", "http://localhost:8080/realms/sirene")

# Télécharge et met en cache les clés publiques
jwks_client = jwt.PyJWKClient(JWKS_URL)
# Lit le header "Authorization: Bearer ..." (et ajoute le bouton Authorize dans /docs)
bearer = HTTPBearer(auto_error=False)


def authenticate(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
    """Token valide ? sinon 401."""
    if creds is None:
        raise HTTPException(401, "Token manquant (header Authorization: Bearer <token>)")
    try:
        # Choisit la bonne clé publique grâce au "kid" du header du token
        key = jwks_client.get_signing_key_from_jwt(creds.credentials).key
        return jwt.decode(
            creds.credentials, key,
            algorithms=["RS256"], issuer=ISSUER,
            options={"verify_aud": False},
        )
    except jwt.PyJWTError as err:
        raise HTTPException(401, f"Token invalide : {err}")


def require_role(role: str):
    """Rôle présent dans le token ? sinon 403."""
    def checker(payload: dict = Depends(authenticate)) -> dict:
        if role not in payload.get("realm_access", {}).get("roles", []):
            raise HTTPException(403, f"Rôle requis : {role}")
        return payload
    return checker
