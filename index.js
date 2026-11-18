const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { authenticate, requireRole } = require('./auth');

const app = express();
const port = 3000;

app.use(express.json());

// ==========================================
// CONFIGURATION SWAGGER / OPENAPI
// ==========================================
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API Sirene Open Data',
      version: '1.0.0',
      description: 'API locale permettant d\'interroger la base de données Sirene (Identifiants, Code Activité, Dénomination).',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Serveur local de développement',
      },
    ],
    // Ajoute le bouton "Authorize" dans Swagger pour coller un JWT
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  // Spécifie à Swagger de lire ce fichier-ci pour trouver les commentaires @swagger
  apis: ['./index.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// On attache l'interface graphique Swagger à la route /api-docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ==========================================
// CONNEXION BDD
// ==========================================
const db = new sqlite3.Database('./sirene.db', sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
        console.error("Erreur BDD :", err.message);
    } else {
        console.log("✅ Connecté à sirene.db");
    }
});

// ==========================================
// ROUTES DE L'API REST (AVEC DOC SWAGGER)
// ==========================================

/**
 * @swagger
 * /api/v1/entreprises/{siren}:
 *   get:
 *     summary: Retrouver une société par son identifiant
 *     description: Retourne les informations complètes d'une unité légale à partir de son numéro SIREN.
 *     parameters:
 *       - in: path
 *         name: siren
 *         required: true
 *         schema:
 *           type: integer
 *         description: Le numéro SIREN (ex 325175)
 *     responses:
 *       401:
 *         description: Token absent ou invalide.
 *       403:
 *         description: Rôle insuffisant.
 *       200:
 *         description: Succès, les données de l'entreprise sont retournées.
 *       404:
 *         description: Entreprise introuvable.
 *       500:
 *         description: Erreur serveur.
 */
app.get('/api/v1/entreprises/:siren', authenticate, requireRole('sirene-read'), (req, res) => {
    const siren = req.params.siren;
    
    db.get("SELECT * FROM mytable WHERE siren = ?", [siren], (err, row) => {
        if (err) return res.status(500).json({ erreur: err.message });
        if (!row) return res.status(404).json({ message: "Entreprise introuvable" });
        res.status(200).json(row);
    });
});

/**
 * @swagger
 * /api/v1/entreprises:
 *   get:
 *     summary: Chercher des entreprises
 *     description: Cherche par code activité (ex 68.20B) OU par dénomination partielle.
 *     parameters:
 *       - in: query
 *         name: code_activite
 *         schema:
 *           type: string
 *         description: Code NAF/APE (ex 68.20B)
 *       - in: query
 *         name: denomination
 *         schema:
 *           type: string
 *         description: Nom de l'entreprise (ex CARPENTIER)
 *     responses:
 *       401:
 *         description: Token absent ou invalide.
 *       403:
 *         description: Rôle insuffisant.
 *       200:
 *         description: Liste des entreprises correspondantes.
 *       400:
 *         description: Paramètre manquant.
 *       500:
 *         description: Erreur serveur.
 */
app.get('/api/v1/entreprises', authenticate, requireRole('sirene-read'), (req, res) => {
    const code_activite = req.query.code_activite;
    const denomination = req.query.denomination;

    if (code_activite) {
        db.all("SELECT * FROM mytable WHERE activite_principale_unite_legale = ?", [code_activite], (err, rows) => {
            if (err) return res.status(500).json({ erreur: err.message });
            res.status(200).json(rows);
        });
    } 
    else if (denomination) {
        const search = `%${denomination}%`;
        db.all("SELECT * FROM mytable WHERE denomination_unite_legale LIKE ? OR nom_unite_legale LIKE ?", [search, search], (err, rows) => {
            if (err) return res.status(500).json({ erreur: err.message });
            res.status(200).json(rows);
        });
    } 
    else {
        res.status(400).json({ message: "Veuillez spécifier ?code_activite=... ou ?denomination=..." });
    }
});

/**
 * @swagger
 * /api/v1/entreprises/{siren}:
 *   patch:
 *     summary: Modifier une entreprise
 *     description: Met à jour des informations (ex pour un changement de nom ou de statut).
 *     parameters:
 *       - in: path
 *         name: siren
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nom_unite_legale:
 *                 type: string
 *                 example: NOUVEAU NOM SARL
 *     responses:
 *       401:
 *         description: Token absent ou invalide.
 *       403:
 *         description: Rôle insuffisant.
 *       200:
 *         description: Mise à jour réussie.
 *       400:
 *         description: Requête invalide.
 *       404:
 *         description: Entreprise introuvable.
 */
app.patch('/api/v1/entreprises/:siren', authenticate, requireRole('sirene-write'), (req, res) => {
    const siren = req.params.siren;
    const nouveauNom = req.body.nom_unite_legale; 

    if (!nouveauNom) {
        return res.status(400).json({ message: "Champ nom_unite_legale requis." });
    }

    db.run("UPDATE mytable SET nom_unite_legale = ? WHERE siren = ?", [nouveauNom, siren], function(err) {
        if (err) return res.status(500).json({ erreur: err.message });
        if (this.changes === 0) return res.status(404).json({ message: "Entreprise introuvable" });
        res.status(200).json({ siren: siren, maj: "succès", nom_unite_legale: nouveauNom });
    });
});

/**
 * @swagger
 * /api/v1/entreprises/{siren}:
 *   delete:
 *     summary: Supprimer une entreprise (Droit à l'oubli)
 *     description: Supprime définitivement l'enregistrement de la base de données locale.
 *     parameters:
 *       - in: path
 *         name: siren
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       401:
 *         description: Token absent ou invalide.
 *       403:
 *         description: Rôle insuffisant.
 *       204:
 *         description: Suppression réussie (pas de contenu).
 *       404:
 *         description: Entreprise introuvable.
 */
app.delete('/api/v1/entreprises/:siren', authenticate, requireRole('sirene-write'), (req, res) => {
    const siren = req.params.siren;

    db.run("DELETE FROM mytable WHERE siren = ?", [siren], function(err) {
        if (err) return res.status(500).json({ erreur: err.message });
        if (this.changes === 0) return res.status(404).json({ message: "Entreprise introuvable" });
        res.status(204).send(); 
    });
});

// ==========================================
// LANCEMENT
// ==========================================
app.listen(port, () => {
    console.log(`✅ API démarrée sur http://localhost:${port}`);
    console.log(`📖 DOCUMENTATION SWAGGER DISPONIBLE SUR : http://localhost:${port}/api-docs`);
});