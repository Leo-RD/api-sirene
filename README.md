# API Sirene – Express

Projet composé de deux services Docker qui partagent une base SQLite issue des données ouvertes **Sirene** :

| Service | Techno | Port | Rôle |
|---------|--------|------|------|
| `api`   | Node.js + Express | 3000 | Recherche d'entreprises par SIREN, code activité (NAF/APE) ou dénomination ; modification et suppression d'enregistrements |
| `stats` | Python + FastAPI + [Polars](https://pola.rs/) | 8000 | Statistiques par code activité et par année de création (agrégations faites par Polars, pas de `GROUP BY` SQL) |

Chaque service sert sa propre documentation interactive (Swagger / OpenAPI).

## Prérequis

- **Node.js** (version LTS recommandée) et **npm**
- ou **Docker**, si vous préférez exécuter l'application dans un conteneur
- Le fichier de base de données **`sirene.db`** à la racine du projet (table `mytable`)

## Lancer l'application (une commande)

```bash
docker compose up --build -d
```

Démarre 4 conteneurs : **Keycloak** (SSO), **api**, **stats** et une **passerelle nginx**. Seule la passerelle est exposée, sur <http://localhost:8080> : les services ne sont donc pas joignables sans passer par l'authentification. Keycloak met ~30 s à démarrer ; `api` et `stats` attendent qu'il soit prêt.

| URL (via la passerelle) | Contenu |
|---|---|
| <http://localhost:8080/auth/> | Console Keycloak (`admin` / `admin`) |
| <http://localhost:8080/api-docs> | Swagger du service `api` |
| <http://localhost:8080/docs> | Swagger du service `stats` |

`sirene.db` est monté en volume : en lecture/écriture pour `api`, en lecture seule pour `stats`.

### Exposition publique avec ngrok

```bash
cp .env.example .env               # puis y coller votre NGROK_AUTHTOKEN
docker compose --profile ngrok up --build -d
```

L'URL publique s'affiche sur <http://localhost:4040> (ou `curl -s localhost:4040/api/tunnels`). Tout passe par ce seul tunnel : Keycloak, API et stats.

## Authentification (OAuth2 / OpenID Connect avec Keycloak)

- Le realm `sirene` est importé automatiquement au démarrage depuis [`keycloak/realm-sirene.json`](keycloak/realm-sirene.json).
- Keycloak émet des **access tokens JWT signés en RS256** (clé asymétrique) : il garde la clé privée, les services ne connaissent que la clé publique, récupérée sur l'endpoint JWKS (`/auth/realms/sirene/protocol/openid-connect/certs`) et mise en cache.
- Chaque service vérifie : signature RS256, expiration, audience `sirene-api`, issuer (realm `sirene`), puis le rôle requis.

| Rôle | Donne accès à |
|---|---|
| `sirene-read` | `GET` sur `api` et tout le service `stats` |
| `sirene-write` | `PATCH` / `DELETE` sur `api` |

Comptes de démonstration (client `sirene-api`, secret `sirene-api-secret`) :

| Utilisateur | Mot de passe | Rôles |
|---|---|---|
| `lecteur` | `lecteur` | `sirene-read` |
| `admin` | `admin` | `sirene-read`, `sirene-write` |
| compte de service (grant `client_credentials`) | – | `sirene-read` |

Réponses : `401` sans token ou token invalide/expiré, `403` si le rôle manque.

### Obtenir un token

```bash
BASE=http://localhost:8080   # ou l'URL ngrok

# Utilisateur (password grant)
TOKEN=$(curl -s $BASE/auth/realms/sirene/protocol/openid-connect/token \
  -d grant_type=password -d client_id=sirene-api -d client_secret=sirene-api-secret \
  -d username=admin -d password=admin | jq -r .access_token)

# Ou machine à machine (client credentials)
TOKEN=$(curl -s $BASE/auth/realms/sirene/protocol/openid-connect/token \
  -d grant_type=client_credentials -d client_id=sirene-api -d client_secret=sirene-api-secret | jq -r .access_token)
```

Dans Swagger, cliquer sur **Authorize** et coller le token.

## Endpoints

### Service `api`

| Méthode  | Route                                             | Description                                              |
|----------|---------------------------------------------------|----------------------------------------------------------|
| `GET`    | `/api/v1/entreprises/{siren}`                     | Récupère une entreprise par son numéro SIREN             |
| `GET`    | `/api/v1/entreprises?code_activite=68.20B`        | Liste les entreprises ayant ce code activité (NAF/APE)   |
| `GET`    | `/api/v1/entreprises?denomination=CARPENTIER`     | Recherche par dénomination ou nom (correspondance partielle) |
| `PATCH`  | `/api/v1/entreprises/{siren}`                     | Modifie le nom (`nom_unite_legale`) d'une entreprise     |
| `DELETE` | `/api/v1/entreprises/{siren}`                     | Supprime une entreprise (droit à l'oubli)                |

### Exemples avec `curl`

```bash
# Rechercher une entreprise par SIREN
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/v1/entreprises/325175

# Rechercher par code activité
curl -H "Authorization: Bearer $TOKEN" "http://localhost:8080/api/v1/entreprises?code_activite=68.20B"

# Rechercher par dénomination
curl -H "Authorization: Bearer $TOKEN" "http://localhost:8080/api/v1/entreprises?denomination=CARPENTIER"

# Modifier le nom d'une entreprise
curl -X PATCH -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/v1/entreprises/325175 \
  -H "Content-Type: application/json" \
  -d '{"nom_unite_legale": "NOUVEAU NOM SARL"}'

# Supprimer une entreprise
curl -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/v1/entreprises/325175
```

### Service `stats`

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/v1/stats/activites?top=20&etat=A` | Classement des codes activité : nombre d'entreprises, nombre d'actives, part en %. `top` (1–2000, défaut 20) et `etat` (`A` actif / `C` cessé) sont optionnels |
| `GET` | `/api/v1/stats/activites/{code}` | Détail d'un code activité : total, répartition par état administratif et par tranche d'effectifs (404 si code inconnu) |
| `GET` | `/api/v1/stats/annees?code_activite=&debut=&fin=` | Nombre d'entreprises créées par année. Tous les filtres sont optionnels |
| `GET` | `/api/v1/stats/annees/{annee}?top=10` | Détail d'une année : nombre de créations et codes activité les plus fréquents (404 si aucune création) |

> Les dates de création absentes ou égales à `1900-01-01` (valeur utilisée par l'INSEE pour une date inconnue) sont exclues des statistiques par année.

```bash
curl -H "Authorization: Bearer $TOKEN" "http://localhost:8080/api/v1/stats/activites?top=10"
curl -H "Authorization: Bearer $TOKEN" "http://localhost:8080/api/v1/stats/activites?etat=A"
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/v1/stats/activites/32.12Z
curl -H "Authorization: Bearer $TOKEN" "http://localhost:8080/api/v1/stats/annees?debut=2000&fin=2010"
curl -H "Authorization: Bearer $TOKEN" "http://localhost:8080/api/v1/stats/annees?code_activite=32.12Z"
curl -H "Authorization: Bearer $TOKEN" "http://localhost:8080/api/v1/stats/annees/2008?top=5"
```

## Structure du projet

```
.
├── index.js              # Service api : serveur Express, routes et Swagger
├── auth.js               # Service api : vérification des JWT Keycloak
├── package.json          # Dépendances et scripts npm
├── Dockerfile            # Image Docker du service api
├── .dockerignore
├── stats-service/        # Service stats
│   ├── main.py           # Application FastAPI + agrégations Polars
│   ├── auth.py           # Vérification des JWT Keycloak
│   ├── requirements.txt  # fastapi, uvicorn, polars, pyjwt
│   └── Dockerfile        # Image Docker du service stats
├── keycloak/realm-sirene.json  # Realm, client, rôles et utilisateurs importés
├── gateway/nginx.conf    # Passerelle : point d'entrée unique (port 8080)
├── .env.example          # NGROK_AUTHTOKEN
├── docker-compose.yml    # Orchestration (Keycloak, api, stats, passerelle, ngrok)
└── sirene.db             # Base SQLite (données Sirene), partagée
```

## Stack technique

**Service `api`**

- [Express 5](https://expressjs.com/) – serveur HTTP
- [sqlite3](https://github.com/TryGhost/node-sqlite3) – accès à la base SQLite
- [swagger-jsdoc](https://github.com/Surnet/swagger-jsdoc) + [swagger-ui-express](https://github.com/scottie1984/swagger-ui-express) – documentation OpenAPI
- [jose](https://github.com/panva/jose) – vérification des JWT (RS256, JWKS)
- [nodemon](https://nodemon.io/) – rechargement automatique en développement

**Service `stats`**
- [FastAPI](https://fastapi.tiangolo.com/) + [Uvicorn](https://www.uvicorn.org/) – serveur HTTP et documentation OpenAPI
- [Polars](https://pola.rs/) – agrégations analytiques en mémoire
- [PyJWT](https://pyjwt.readthedocs.io/) – vérification des JWT (RS256, JWKS)

**Infrastructure**
- [Keycloak 26](https://www.keycloak.org/) – SSO, serveur OAuth2 / OpenID Connect
- [nginx](https://nginx.org/) – passerelle
- [ngrok](https://ngrok.com/) – exposition publique
