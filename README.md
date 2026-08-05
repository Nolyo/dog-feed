# Dog Feed — suivi des repas des chiens

Petite PWA auto-hébergée pour valider les repas (matin / soir) avec **photo prise depuis le site**, **PIN**, **notifications** (iPhone en mode écran d’accueil) et **alertes Discord**.

Durée de vie prévue : ~2 semaines de vacances.

## Fonctionnalités

- PIN simple, session ~14 jours
- 2 créneaux / jour (défaut **9h** et **20h**, fuseau `Europe/Paris`)
- Photo live → tampon date/heure → stockage
- Push navigateur aux heures de repas (si PWA installée)
- Discord : message + photo à chaque validation ; alerte d’oubli +2h (11h / 22h)
- Historique 14 jours pour le parent

## Démarrage local

```bash
cd dog-feed
cp .env.example .env
# édite PIN, SESSION_SECRET, DISCORD_WEBHOOK_URL
npm install
npm run generate-vapid   # optionnel si tu veux fixer les clés
node scripts/generate-icons.mjs
npm run build
npm start
```

Dev (API + hot reload frontend via proxy) :

```bash
# terminal 1
npm run dev

# terminal 2
npm run dev:web
```

Ouvre `http://localhost:5173` (frontend) ou `http://localhost:3000` (build complet).

## Docker / DockPloy

```bash
docker compose up -d --build
```

Variables d’environnement importantes :

| Variable | Description |
|----------|-------------|
| `PIN` | Code d’accès |
| `SESSION_SECRET` | Secret long pour les cookies |
| `DISCORD_WEBHOOK_URL` | Webhook salon Discord |
| `VAPID_*` | Clés Web Push (générées auto dans `/data` si absentes) |
| `FEED_MORNING_HOUR` / `FEED_EVENING_HOUR` | Heures des rappels |
| `MISS_GRACE_HOURS` | Délai avant alerte oubli (défaut 2) |
| `DATA_DIR` | `/data` en conteneur (volume persistant) |
| `COOKIE_SECURE` | `true` en HTTPS (DockPloy) ; `false` en HTTP local |

**DockPloy** : build depuis ce dépôt, monte un volume sur `/data`, expose le port 3000 (ou laisse Traefik router sur le service), renseigne les env. En HTTPS mets `COOKIE_SECURE=true`.

Healthcheck : `GET /api/health`

## iPhone (fils)

1. Ouvrir le site dans **Safari**
2. Partager → **Sur l’écran d’accueil**
3. Ouvrir l’icône Dog Feed
4. Entrer le PIN
5. **Activer les notifications**

Sans installation PWA, la photo marche mais les notifs push iOS non.

## Spec

Voir `docs/superpowers/specs/2026-08-05-dog-feeding-tracker-design.md`.
