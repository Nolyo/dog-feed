# Spec — Suivi des repas des chiens (vacances)

**Date** : 2026-08-05  
**Statut** : design validé (approche A — app Docker légère)  
**Durée de vie prévue** : ~2 semaines (auto-hébergé DockPloy / Dokploy)

## Objectif

Petite application web pour que le fils nourrisse les chiens **deux fois par jour** pendant les vacances des parents, avec :

1. un **rappel** (notifications navigateur / PWA) aux heures de repas ;
2. une **preuve photo** prise depuis le site (pas depuis la galerie) ;
3. une **vue parent** pour vérifier à distance ;
4. des **alertes Discord** (repas fait + oubli).

Pas de comptes utilisateurs complexes : un **PIN simple**, usage familial de confiance.

## Contexte & contraintes

| Élément | Choix |
|--------|--------|
| Utilisateur principal (preuve) | Fils, **iPhone / Safari** |
| Parent | Consultation web + **Discord** |
| Créneaux | Matin **9h**, soir **20h** (Europe/Paris) |
| Oubli | Alerte si non fait **2 h après** (11h / 22h) |
| Auth | PIN unique, session ~14 jours |
| Hébergement | 1 conteneur Docker, volume persistant, DockPloy |
| Preuve | Photo **live** obligatoire pour valider un créneau |

Limite honnête : on ne peut pas prouver à 100 % qu’une photo n’est pas une rephoto d’écran. On force la capture caméra + tampon date/heure serveur — suffisant pour un fils de confiance.

## Approche retenue

**A — Monolithe léger en un conteneur**

- Backend Node (**Hono**) + better-sqlite3 + fichiers photos sur disque  
- Frontend Vite + TypeScript minimal, **PWA** installable (écran d’accueil iPhone)  
- Jobs internes (cron in-process, ex. `node-cron`) : push 9h/20h, Discord oubli 11h/22h  
- `web-push` + clés VAPID ; webhook Discord pour les alertes parent  
- `sharp` pour resize + tampon date/heure sur l’image  

Écarté :

- **B** Next + Postgres + stockage objet : overkill pour 2 semaines  
- **C** no-code (n8n / formulaires) : caméra forcée + PWA iOS difficiles à maîtriser  

## Parcours utilisateur

### Entrée

1. Ouverture de l’URL → écran **PIN**  
2. PIN correct → cookie/session httpOnly (~14 jours)  
3. Accès aux écrans app  

### Fils — accueil « Aujourd’hui »

- Deux cartes : **Matin (9h)** et **Soir (20h)**  
- États : `À faire` | `Fait ✓` (+ miniature de la photo)  
- CTA sur un créneau non fait : **Nourrir / Prendre la photo**  

### Fils — flux photo

1. Ouverture de la **caméra** (live uniquement)  
2. Prise de vue → aperçu  
3. Valider → upload (`slot` + image)  
4. Serveur : vérifie session, créneau libre, traite l’image (tampon), stocke, enregistre en DB  
5. Discord : message « Repas [matin|soir] validé » + image (ou lien)  
6. UI : carte passée en `Fait ✓`  

### Setup iPhone (obligatoire pour les notifs)

- Bandeau : **Ajouter à l’écran d’accueil** (PWA)  
- Bouton **Activer les notifications** (après install PWA ; iOS 16.4+)  
- Abonnement push stocké côté serveur  

### Parent — suivi

- Même app, section/onglet **Historique**  
- Liste par jour : matin/soir + miniatures cliquables (plein écran)  
- Alertes Discord sans ouvrir le site :  
  - à chaque preuve ;  
  - à 11h / 22h si créneau encore vide  

## Règles métier

1. **Un seul enregistrement** par couple `(date locale, slot)` — pas de second upload en v1  
2. **Photo obligatoire** pour marquer un créneau comme fait  
3. Capture **live** : `capture="environment"` et/ou `getUserMedia` ; **pas** d’`accept` galerie libre  
4. Tampon **date/heure serveur** (timezone Europe/Paris) dessiné sur l’image avant stockage  
5. Push fils à **9h** et **20h** uniquement si le créneau du jour n’est pas encore fait  
6. Discord oubli à **11h** et **22h** si toujours vide (une alerte oubli par créneau manqué)  
7. Upload accepté **24h/24** tant que le créneau du jour n’est pas rempli (pas de blocage hors fenêtre — le fils peut rattraper ; l’oubli a déjà alerté)  
8. Horaires et grâce configurables via variables d’environnement  

## Modèle de données

### SQLite — `feedings`

| Colonne | Type | Notes |
|---------|------|--------|
| id | INTEGER PK | |
| feed_date | TEXT | `YYYY-MM-DD` en Europe/Paris |
| slot | TEXT | `morning` \| `evening` |
| photo_path | TEXT | chemin relatif sous `/data/photos` |
| created_at | TEXT | ISO datetime |

Contrainte : `UNIQUE(feed_date, slot)`

### SQLite — `push_subscriptions`

| Colonne | Type | Notes |
|---------|------|--------|
| id | INTEGER PK | |
| endpoint | TEXT UNIQUE | |
| p256dh | TEXT | |
| auth | TEXT | |
| created_at | TEXT | |

### SQLite — `miss_alerts`

| Colonne | Type | Notes |
|---------|------|--------|
| id | INTEGER PK | |
| feed_date | TEXT | `YYYY-MM-DD` |
| slot | TEXT | `morning` \| `evening` |
| sent_at | TEXT | ISO datetime |

Contrainte : `UNIQUE(feed_date, slot)` — garantit **une seule** alerte Discord d’oubli par créneau, même après redémarrage du conteneur.

### Fichiers

```
/data/
  app.db
  photos/
    2026-08-05-morning.jpg
    2026-08-05-evening.jpg
```

## API

Session cookie requise sauf `GET /api/health` et `POST /api/login`.

| Méthode | Route | Rôle |
|---------|-------|------|
| GET | `/api/health` | healthcheck DockPloy (public) |
| POST | `/api/login` | body `{ pin }` → set cookie session |
| POST | `/api/logout` | clear session |
| GET | `/api/today` | état matin/soir du jour + URLs miniatures si fait |
| GET | `/api/history?days=14` | liste des feedings récents |
| POST | `/api/feed` | multipart : `slot` + `photo` → crée feeding, Discord |
| POST | `/api/push/subscribe` | enregistre subscription Web Push |
| DELETE | `/api/push/subscribe` | désabonnement |
| GET | `/api/photos/:name` | sert la photo (auth session) |
| GET | `/api/vapid-public-key` | clé publique VAPID pour le client push (auth session) |

Erreurs notables :

- `401` PIN / session invalide  
- `409` créneau déjà validé  
- `400` image manquante / slot invalide / type non image  

## Frontend (écrans)

1. **Login** — champ PIN + valider  
2. **Home** — cartes jour + CTA caméra  
3. **Capture** — flux caméra / file input capture, aperçu, envoi  
4. **Historique** — liste 14 jours  
5. **Bannières** — install PWA + permission notifications  

UI : mobile-first, gros boutons, français, peu de chrome. Pas de multi-chiens, pas de chat.

## Jobs planifiés (in-process)

Timezone : `Europe/Paris` (env `TZ`).

| Heure | Action |
|-------|--------|
| `FEED_MORNING_HOUR` (déf. 9) | Si pas de feeding morning aujourd’hui → push « N’oublie pas le repas du matin » |
| `FEED_EVENING_HOUR` (déf. 20) | Idem soir |
| morning + `MISS_GRACE_HOURS` (déf. 11) | Si toujours vide → Discord alerte oubli matin (1×) |
| evening + grace (déf. 22) | Idem soir |

Idempotence oubli : table `miss_alerts` (`UNIQUE(feed_date, slot)`) pour ne pas spammer Discord au redémarrage.

## Configuration (env)

```
PIN=****
SESSION_SECRET=random-long
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@example.com
TZ=Europe/Paris
FEED_MORNING_HOUR=9
FEED_EVENING_HOUR=20
MISS_GRACE_HOURS=2
PORT=3000
```

## Docker / DockPloy

- Image unique multi-stage : build frontend → runtime Node servant static + API  
- Volume nommé monté sur `/data`  
- Healthcheck HTTP `GET /api/health` (public, sans auth)  
- Exposition via Traefik/DockPloy + HTTPS sur sous-domaine choisi par l’utilisateur  
- Pas de base externe  

## Sécurité (niveau « 2 semaines familiale »)

- PIN comparé en constant-time ; pas de bruteforce sophistiqué requis, mais rate-limit login basique (ex. 10 essais / 15 min / IP)  
- Cookie `HttpOnly`, `Secure`, `SameSite=Lax`  
- Photos non listables sans session  
- Webhook Discord et PIN hors dépôt (env DockPloy)  
- Pas de surface admin hors PIN  

Hors scope sécurité « pro » : 2FA, RBAC, chiffrement photos au repos, audit log.

## Gestion des erreurs & points de vigilance

| Risque | Mitigation |
|--------|------------|
| iOS : pas de notif sans PWA | Bandeau install + doc courte au premier lancement |
| iOS < 16.4 | Notifs indisponibles ; l’app reste utilisable manuellement |
| Discord down | Log erreur ; feeding quand même enregistré |
| Conteneur redémarré | Jobs replanifiés ; flags oubli évitent double alerte |
| Volume non monté | Perte données au recreate — documenter le volume DockPloy |
| Photo trop lourde | Resize serveur (ex. max 1600px, JPEG) avant stockage |

## Critères de succès

- Depuis l’iPhone (PWA) : PIN → photo live → créneau `Fait` en moins de 30 s  
- Parent reçoit un message Discord avec preuve après validation  
- Si aucun upload : alerte Discord oubli à 11h / 22h  
- Parent voit l’historique + photos sur le site  
- Redéploiement DockPloy sans perte si volume `/data` conservé  
- Mise en service en une image + variables d’env, sans service tiers hors Discord  

## Hors scope (v1)

- Comptes multi-utilisateurs / rôles fils vs parent  
- SMS, e-mail  
- Multi-chiens / multi-bols séparés  
- Annulation / re-upload d’un créneau  
- Détection IA « c’est bien de la gamelle »  
- Export PDF, analytics  
- App native Store  

## Structure projet prévue

```
dog-feed/
  docs/          # ou renvoi vers cette spec
  src/
    server/      # API, jobs, discord, push, db
    web/         # PWA frontend
  Dockerfile
  docker-compose.yml  # dev / référence DockPloy
  README.md
  package.json
```

Nom de dépôt / dossier : `dog-feed` (à créer à l’implémentation).

## Prochaines étapes

1. Revue de cette spec par l’utilisateur  
2. Plan d’implémentation (`writing-plans`)  
3. Scaffold + implémentation + image Docker prête DockPloy  
