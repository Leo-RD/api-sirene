# Utilisation de la version LTS de Node (Linux Debian 13 : glibc >= 2.38 requise par sqlite3 v6)
FROM node:lts-trixie-slim

# Définition du dossier de travail dans le conteneur
WORKDIR /app

# Copie des fichiers de configuration NPM
COPY package*.json ./

# Installation des dépendances (sqlite3 compilera sa version Linux ARM64 ici)
RUN npm install --production

# Copie du reste du code (y compris index.js et sirene.db)
COPY . .

# Indique le port sur lequel l'API écoute
EXPOSE 3000

# Commande de démarrage officielle
CMD ["node", "index.js"]