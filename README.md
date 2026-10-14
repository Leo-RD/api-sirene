# API Sirene – Express

API REST locale (Node.js + Express) permettant d'interroger une base SQLite issue des données ouvertes **Sirene** : recherche d'entreprises par SIREN, code activité (NAF/APE) ou dénomination, ainsi que modification et suppression d'enregistrements.

La documentation interactive de l'API (Swagger / OpenAPI) est servie par l'application elle-même.

## Prérequis

- **Node.js** (version LTS recommandée) et **npm**
- ou **Docker**, si vous préférez exécuter l'application dans un conteneur
- Le fichier de base de données **`sirene.db`** à la racine du projet (table `mytable`)

## Lancer l'application

### Option 1 – En local avec Node.js

```bash
# 1. Installer les dépendances
npm install

# 2. Démarrer l'API
npm start
```

Pour le développement, avec redémarrage automatique à chaque modification (via `nodemon`) :

```bash
npm run dev
```

### Option 2 – Avec Docker

```bash
# 1. Construire l'image
docker build -t mon-api-express .

# 2. Lancer le conteneur
docker run -p 3000:3000 mon-api-express
```

> La base `sirene.db` est copiée dans l'image au moment du build : les modifications faites via l'API (PATCH / DELETE) sont perdues à la suppression du conteneur. Pour les conserver, montez le fichier en volume :
>
> ```bash
> docker run -p 3000:3000 -v "$(pwd)/sirene.db:/app/sirene.db" mon-api-express
> ```

### Vérifier que l'API tourne

Au démarrage, la console affiche notamment :

```
✅ API démarrée sur http://localhost:3000
📖 DOCUMENTATION SWAGGER DISPONIBLE SUR : http://localhost:3000/api-docs
✅ Connecté à sirene.db
```

- API : <http://localhost:3000>
- Documentation Swagger : <http://localhost:3000/api-docs>

## Endpoints

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
curl http://localhost:3000/api/v1/entreprises/325175

# Rechercher par code activité
curl "http://localhost:3000/api/v1/entreprises?code_activite=68.20B"

# Rechercher par dénomination
curl "http://localhost:3000/api/v1/entreprises?denomination=CARPENTIER"

# Modifier le nom d'une entreprise
curl -X PATCH http://localhost:3000/api/v1/entreprises/325175 \
  -H "Content-Type: application/json" \
  -d '{"nom_unite_legale": "NOUVEAU NOM SARL"}'

# Supprimer une entreprise
curl -X DELETE http://localhost:3000/api/v1/entreprises/325175
```

## Structure du projet

```
.
├── index.js          # Serveur Express, routes et configuration Swagger
├── sirene.db         # Base de données SQLite (données Sirene)
├── package.json      # Dépendances et scripts npm
├── Dockerfile        # Image Docker de l'application
└── .dockerignore
```

## Stack technique

- [Express 5](https://expressjs.com/) – serveur HTTP
- [sqlite3](https://github.com/TryGhost/node-sqlite3) – accès à la base SQLite
- [swagger-jsdoc](https://github.com/Surnet/swagger-jsdoc) + [swagger-ui-express](https://github.com/scottie1984/swagger-ui-express) – documentation OpenAPI
- [nodemon](https://nodemon.io/) – rechargement automatique en développement
