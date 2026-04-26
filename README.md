# Portail DAC — Distribution Alimentaire Chevalier

Portail B2B privé pour la gestion d'inventaire de viande et la prise de commandes par des clients-détaillants. Monorepo React + Node.js + SQLite.

## Prérequis

- Node.js 20 ou 22 (LTS recommandé)
- npm 10+

## Installation

```bash
npm install
```

La première installation compile `better-sqlite3` (natif) — cela peut prendre 30 à 60 secondes.

## Initialiser la base de données

```bash
npm run seed
```

Crée la base SQLite dans `server/data/dac.db` et insère :

- Un compte admin : `admin` / `admin123` (changement de mot de passe forcé à la première connexion)
- Les catégories de viande de base (Bœuf, Porc, Volaille, Agneau, Veau, Charcuterie, Poisson & fruits de mer, Autre)
- Une liste de prix « Standard » par défaut

## Lancer en développement

```bash
npm run dev
```

- Backend Express : http://localhost:3001
- Frontend Vite : http://localhost:5173 (proxy `/api` et `/uploads` vers 3001)

Ouvrez http://localhost:5173 et connectez-vous avec `admin` / `admin123`.

## Flux principaux

### Côté admin
1. Changer le mot de passe initial
2. Créer/gérer les **catégories** et **produits** (avec photo, lot, péremption, poids variable, taxable)
3. Créer une ou plusieurs **listes de prix** et y saisir les prix par produit
4. Créer des **comptes clients** avec identifiant + mot de passe temporaire, assigner une liste de prix ou le mode « sur demande »
5. Recevoir les **commandes** soumises, ajuster les quantités confirmées pour les produits à poids variable, confirmer → livrer → télécharger le PDF du bon de livraison
6. Exporter les commandes filtrées en **CSV**
7. Le **tableau de bord** affiche stock bas, commandes en attente, expirations proches et mouvements récents

### Côté client
1. Se connecter avec les identifiants fournis et changer son mot de passe
2. Parcourir le **catalogue** filtré par catégorie ou recherche, voir le stock disponible et les prix (selon sa liste, ou « sur demande »)
3. Ajouter au **panier**, ajuster les quantités, voir les taxes TPS/TVQ calculées automatiquement (les produits non taxables sont exclus)
4. Choisir une **date de livraison souhaitée** et soumettre (validation stock + montant minimum si configuré)
5. Suivre ses commandes dans **Mes commandes** avec le statut (soumise → confirmée → livrée)

## Structure

```
dac/
├── package.json            # workspaces root
├── client/                 # React + Vite + Tailwind
│   ├── src/
│   │   ├── app/            # routing
│   │   ├── components/     # layout + UI
│   │   ├── features/       # admin-* et client-*
│   │   ├── i18n/           # fr.json / en.json
│   │   ├── lib/            # api, format, cn
│   │   └── theme/          # light/dark
└── server/                 # Express + SQLite
    ├── src/
    │   ├── db/             # migrations SQL + seed
    │   ├── routes/         # auth, admin, client
    │   ├── services/       # taxes, stock, orders, pdf
    │   ├── middleware/     # auth JWT
    │   └── index.ts
    ├── data/               # fichier SQLite (ignoré par git)
    └── uploads/            # images produits (ignoré par git)
```

## Configuration

Copier `server/.env.example` → `server/.env` et ajuster au besoin. En production, **changer `JWT_SECRET`**.

## Build production

```bash
npm run build
npm start
```

Le build Vite est dans `client/dist/` et le build Node dans `server/dist/`. Pour déployer sur un serveur, il faudra servir le `client/dist/` (par exemple via Nginx ou en ajoutant un middleware `express.static` au server) et démarrer le Node avec les variables d'environnement appropriées.

## Taxes

TPS 5 % + TVQ 9.975 % appliquées uniquement aux lignes dont le produit est marqué taxable. Calculées au moment de la soumission et recalculées lors de la confirmation si les quantités sont ajustées (poids variable).

## Rôles et sécurité

- Authentification par cookie JWT httpOnly, rôle `admin` ou `client`
- Les routes `/api/admin/*` sont inaccessibles aux clients (403)
- Les clients ne voient que leur propre panier et leur propre historique
- Les mots de passe sont hachés avec bcrypt
- Aux réinitialisations et à la création, les clients doivent changer leur mot de passe à la connexion suivante
