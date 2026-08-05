# Dog Feeding Tracker Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Petite PWA auto-hébergée (Docker) pour valider les repas des chiens 2×/jour avec photo live, PIN, push iOS et alertes Discord.

**Architecture:** Monolithe Node (Hono) + SQLite + fichiers photos, frontend Vite PWA servi par le même process, jobs cron in-process.

**Tech Stack:** Node 22, Hono, better-sqlite3, sharp, web-push, node-cron, Vite, TypeScript

**Spec:** `docs/superpowers/specs/2026-08-05-dog-feeding-tracker-design.md`  
**Projet:** `dog-feed/`

## Global Constraints

- Europe/Paris ; repas 9h / 20h ; oubli +2h
- PIN simple, session cookie ~14 jours
- Photo live only, 1 feeding par (date, slot)
- Discord webhook pour fait + oubli
- Un conteneur, volume `/data`
- UI française, mobile-first iPhone

---

### Task 1: Scaffold projet

**Files:**
- Create: `dog-feed/package.json`, `tsconfig.json`, `Dockerfile`, `docker-compose.yml`, `.env.example`, `README.md`, `src/server/*`, `src/web/*`

- [x] Structure + deps + scripts build/start
- [x] Config env centralisée

### Task 2: DB + auth + API core

- [x] Schema feedings, push_subscriptions, miss_alerts
- [x] Login PIN, session cookie, rate-limit basique
- [x] Routes health, today, history, feed, photos, push, vapid

### Task 3: Image + Discord + jobs

- [x] Resize + watermark date/heure
- [x] Webhook Discord (fait + oubli)
- [x] Cron push 9h/20h et oubli 11h/22h

### Task 4: Frontend PWA

- [x] Login, home cartes, capture caméra, historique
- [x] manifest + service worker + subscribe push
- [x] Bandeau install iOS

### Task 5: Docker + vérif

- [x] Multi-stage Dockerfile, volume `/data`
- [x] Build local + smoke test API
