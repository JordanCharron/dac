# Déploiement production — Portail DAC

## Prérequis

- Docker + Docker Compose sur un serveur Linux (Ubuntu/Debian recommandé)
- Un nom de domaine pointé vers le serveur (ex: `portal.chevalier.ca`)
- Reverse proxy (nginx ou Caddy) avec TLS (Let's Encrypt recommandé)
- Serveur SMTP (ex: Mailgun, SendGrid, Postmark, ou votre Microsoft 365/Google Workspace)

## Variables d'environnement (OBLIGATOIRES)

Créer un fichier `.env` à la racine :

```bash
# Sécurité — générer avec: openssl rand -base64 48
JWT_SECRET=REMPLACER_PAR_UNE_LONGUE_CHAINE_ALEATOIRE

# URL publique du portail (origine CORS + liens dans les courriels)
CLIENT_ORIGIN=https://portal.chevalier.ca

# SMTP
SMTP_HOST=smtp.mandrillapp.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
EMAIL_FROM=DAC <no-reply@chevalier.ca>

# Identité de l'entreprise (affiché dans PDFs et emails)
COMPANY_NAME=Distribution Alimentaire Chevalier Inc.
COMPANY_ADDRESS=123 rue Exemple, Québec, QC G1A 1A1
COMPANY_PHONE=(418) 555-1234
COMPANY_EMAIL=info@chevalier.ca
COMPANY_GST=123456789 RT0001
COMPANY_QST=1234567890 TQ0001
```

## Démarrage

```bash
# Premier démarrage (build image + lance)
docker compose up -d --build

# Initialiser la base (seed complet AVEC données de démo):
docker compose exec portal node server/dist/db/seed.js

# Logs
docker compose logs -f portal

# Health check
curl http://localhost:3001/api/health
```

## Nginx reverse proxy (exemple)

```nginx
server {
  listen 443 ssl http2;
  server_name portal.chevalier.ca;

  ssl_certificate /etc/letsencrypt/live/portal.chevalier.ca/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/portal.chevalier.ca/privkey.pem;

  client_max_body_size 10M;

  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;

    # SSE (pour notifications temps réel admin)
    proxy_buffering off;
    proxy_read_timeout 3600s;
  }
}

server {
  listen 80;
  server_name portal.chevalier.ca;
  return 301 https://$host$request_uri;
}
```

## Servir le frontend

Deux options :

**Option 1 — Nginx sert les statiques** (recommandé en production) :
```nginx
location / {
  root /var/www/dac-client;
  try_files $uri /index.html;
}
location /api/ { proxy_pass http://127.0.0.1:3001; ... }
location /uploads/ { proxy_pass http://127.0.0.1:3001; ... }
```
Copier le contenu de `client/dist/` dans `/var/www/dac-client/` après chaque déploiement.

**Option 2 — Express sert `client/dist/`** : ajouter dans `server/src/index.ts`:
```ts
if (env.NODE_ENV === 'production') {
  app.use(express.static(path.resolve('../client/dist')));
  app.get('*', (_req, res) => res.sendFile(path.resolve('../client/dist/index.html')));
}
```

## Backups

Le service `backup` du `docker-compose.yml` fait automatiquement:
- Backup SQLite via `.backup` (safe avec app en cours d'utilisation)
- Compression gzip
- Rotation à 30 jours
- Stockage dans `./backups/` sur l'hôte

Tester une restauration :
```bash
gunzip -c backups/dac-20260421-020000.db.gz > restored.db
sqlite3 restored.db "SELECT count(*) FROM orders;"
```

Pour off-site backup, ajouter un cron hôte qui push `./backups/` vers S3/Backblaze/etc.

## Monitoring

- Health endpoint: `GET /api/health` → `{"ok":true,"ts":"..."}`
- Logs Docker: `docker compose logs -f portal`
- Envisager: uptime-kuma, healthchecks.io, ou simple cron qui pollà `/api/health` et alerte si down

## Mise à jour

```bash
git pull
docker compose up -d --build
# Les migrations SQL se jouent automatiquement au démarrage
```

## Sécurité

- Le `JWT_SECRET` DOIT être défini et ≥ 32 caractères aléatoires. En production, `env.ts` lèvera une erreur au boot si absent.
- Les cookies sont `httpOnly + secure` en production (grâce à `NODE_ENV=production`).
- Rate limit : 10 tentatives login / 15 min / IP.
- Helmet actif avec CSP en production.
- Aucun accès direct à SQLite depuis l'extérieur — le fichier vit dans un volume Docker.

## Checklist avant la mise en ligne

- [ ] `.env` rempli avec `JWT_SECRET` fort + SMTP réel + COMPANY_*
- [ ] DNS pointe vers le serveur
- [ ] Certificat TLS installé
- [ ] `docker compose up -d --build` réussit, `/api/health` retourne 200
- [ ] Envoyer un vrai courriel de test (créer une commande, soumettre, envoyer le bon)
- [ ] Vérifier le backup après 24 h (`ls -la backups/`)
- [ ] Seeder l'admin initial et changer le mot de passe immédiatement
- [ ] Documenter les credentials admin dans un gestionnaire de mots de passe (1Password, Bitwarden)
