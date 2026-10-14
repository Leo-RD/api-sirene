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

### Option 2 – Avec Docker Compose (recommandé : les deux services)

```bash
docker compose up --build        # ajouter -d pour lancer en arrière-plan
docker compose down              # arrêter
```

`sirene.db` est monté en volume dans les deux conteneurs : en lecture/écriture pour `api`, en lecture seule pour `stats`. Les modifications faites via l'API (PATCH / DELETE) sont donc conservées et immédiatement visibles dans les statistiques (la base est relue à chaque requête).

### Option 3 – API seule avec Docker

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

- API : <http://localhost:3000> – documentation : <http://localhost:3000/api-docs>
- Service stats : <http://localhost:8000> – documentation : <http://localhost:8000/docs>

## Endpoints

### Service `api` (port 3000)

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

### Service `stats` (port 8000)

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/v1/stats/activites?top=20&etat=A` | Classement des codes activité : nombre d'entreprises, nombre d'actives, part en %. `top` (1–2000, défaut 20) et `etat` (`A` actif / `C` cessé) sont optionnels |
| `GET` | `/api/v1/stats/activites/{code}` | Détail d'un code activité : total, répartition par état administratif et par tranche d'effectifs (404 si code inconnu) |
| `GET` | `/api/v1/stats/annees?code_activite=&etat=&debut=&fin=` | Nombre d'entreprises créées par année (avec nombre d'actives et cumul). Tous les filtres sont optionnels ; `nb_sans_date` compte les entreprises sans date de création connue |
| `GET` | `/api/v1/stats/annees/{annee}?top=10` | Détail d'une année : total, actives et codes activité les plus fréquents (404 si aucune création) |

> Les dates de création absentes ou égales à `1900-01-01` (valeur utilisée par l'INSEE pour une date inconnue) sont exclues des statistiques par année.

```bash
curl "http://localhost:8000/api/v1/stats/activites?top=10"
curl "http://localhost:8000/api/v1/stats/activites?etat=A"
curl http://localhost:8000/api/v1/stats/activites/32.12Z
curl "http://localhost:8000/api/v1/stats/annees?debut=2000&fin=2010"
curl "http://localhost:8000/api/v1/stats/annees?code_activite=32.12Z"
curl "http://localhost:8000/api/v1/stats/annees/2008?top=5"
```

## Structure du projet

```
.
├── index.js              # Service api : serveur Express, routes et Swagger
├── package.json          # Dépendances et scripts npm
├── Dockerfile            # Image Docker du service api
├── .dockerignore
├── stats-service/        # Service stats
│   ├── main.py           # Application FastAPI + agrégations Polars
│   ├── requirements.txt  # fastapi, uvicorn, polars
│   └── Dockerfile        # Image Docker du service stats
├── docker-compose.yml    # Orchestration des deux services
└── sirene.db             # Base SQLite (données Sirene), partagée
```

## Stack technique

**Service `api`**

- [Express 5](https://expressjs.com/) – serveur HTTP
- [sqlite3](https://github.com/TryGhost/node-sqlite3) – accès à la base SQLite
- [swagger-jsdoc](https://github.com/Surnet/swagger-jsdoc) + [swagger-ui-express](https://github.com/scottie1984/swagger-ui-express) – documentation OpenAPI
- [nodemon](https://nodemon.io/) – rechargement automatique en développement

**Service `stats`**
- [FastAPI](https://fastapi.tiangolo.com/) + [Uvicorn](https://www.uvicorn.org/) – serveur HTTP et documentation OpenAPI
- [Polars](https://pola.rs/) – agrégations analytiques en mémoire
