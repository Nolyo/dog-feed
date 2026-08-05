import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { Hono } from "hono";
import { config, isSlot, type Slot } from "./config.js";
import {
  checkLoginRateLimit,
  clearSessionCookie,
  createSessionToken,
  getSessionFromRequest,
  pinMatches,
  requireAuth,
  setSessionCookie,
} from "./auth.js";
import {
  getFeeding,
  insertFeeding,
  listFeedingsSince,
  upsertPushSubscription,
  deletePushSubscription,
} from "./db.js";
import { todayDate, isoNow } from "./dates.js";
import { processAndSavePhoto } from "./image.js";
import { notifyFeedingDone } from "./discord.js";

function clientIp(c: { req: { header: (n: string) => string | undefined } }): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown"
  );
}

function daysAgoDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: config.tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function photoUrl(fileName: string): string {
  return `/api/photos/${encodeURIComponent(fileName)}`;
}

export function createApiApp() {
  const api = new Hono();

  api.get("/health", (c) => c.json({ ok: true }));

  api.post("/login", async (c) => {
    const ip = clientIp(c);
    const limit = checkLoginRateLimit(ip);
    if (!limit.ok) {
      return c.json(
        {
          error: "Trop de tentatives. Réessaie plus tard.",
          retryAfterSec: limit.retryAfterSec,
        },
        429,
      );
    }

    let body: { pin?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "JSON invalide" }, 400);
    }

    if (!pinMatches(String(body.pin ?? ""))) {
      return c.json({ error: "PIN incorrect" }, 401);
    }

    setSessionCookie(c, createSessionToken());
    return c.json({ ok: true });
  });

  api.post("/logout", (c) => {
    clearSessionCookie(c);
    return c.json({ ok: true });
  });

  api.get("/me", (c) => c.json({ authenticated: getSessionFromRequest(c) }));

  const authed = new Hono();
  authed.use("*", requireAuth);

  authed.get("/today", (c) => {
    const date = todayDate();
    const morning = getFeeding(date, "morning");
    const evening = getFeeding(date, "evening");
    return c.json({
      date,
      hours: {
        morning: config.feedMorningHour,
        evening: config.feedEveningHour,
      },
      morning: morning
        ? {
            done: true,
            createdAt: morning.created_at,
            photoUrl: photoUrl(morning.photo_path),
          }
        : { done: false },
      evening: evening
        ? {
            done: true,
            createdAt: evening.created_at,
            photoUrl: photoUrl(evening.photo_path),
          }
        : { done: false },
    });
  });

  authed.get("/history", (c) => {
    const days = Math.min(60, Math.max(1, Number(c.req.query("days") || 14)));
    const from = daysAgoDate(days - 1);
    const rows = listFeedingsSince(from);
    return c.json({
      from,
      items: rows.map((r) => ({
        date: r.feed_date,
        slot: r.slot,
        createdAt: r.created_at,
        photoUrl: photoUrl(r.photo_path),
      })),
    });
  });

  authed.post("/feed", async (c) => {
    const body = await c.req.parseBody();
    const slotRaw = String(body.slot ?? "");
    if (!isSlot(slotRaw)) {
      return c.json({ error: "slot invalide (morning|evening)" }, 400);
    }
    const slot = slotRaw as Slot;

    const file = body.photo;
    if (!file || !(file instanceof File)) {
      return c.json({ error: "photo manquante" }, 400);
    }
    // Some mobile browsers send empty type for camera captures
    if (file.type && !file.type.startsWith("image/")) {
      return c.json({ error: "type non image" }, 400);
    }

    const date = todayDate();
    if (getFeeding(date, slot)) {
      return c.json({ error: "Ce créneau est déjà validé", code: "already_done" }, 409);
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.byteLength < 100) {
      return c.json({ error: "image trop petite" }, 400);
    }
    if (buf.byteLength > 15 * 1024 * 1024) {
      return c.json({ error: "image trop lourde (max 15 Mo)" }, 400);
    }

    let saved: { relativePath: string; absolutePath: string };
    try {
      saved = await processAndSavePhoto(buf, date, slot);
    } catch (err) {
      console.error("[feed] image process failed", err);
      return c.json({ error: "échec traitement image" }, 400);
    }

    let feeding;
    try {
      feeding = insertFeeding(date, slot, saved.relativePath, isoNow());
    } catch (err) {
      console.error("[feed] insert failed", err);
      return c.json({ error: "Ce créneau est déjà validé", code: "already_done" }, 409);
    }

    void notifyFeedingDone(date, slot, saved.absolutePath).catch((e) =>
      console.error("[feed] discord", e),
    );

    return c.json({
      ok: true,
      date: feeding.feed_date,
      slot: feeding.slot,
      createdAt: feeding.created_at,
      photoUrl: photoUrl(feeding.photo_path),
    });
  });

  authed.get("/photos/:name", (c) => {
    const name = c.req.param("name");
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}-(morning|evening)\.jpg$/.test(name)) {
      return c.json({ error: "nom invalide" }, 400);
    }
    const path = join(config.photosDir, name);
    if (!existsSync(path)) {
      return c.json({ error: "introuvable" }, 404);
    }
    const data = readFileSync(path);
    return new Response(data, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  });

  authed.get("/vapid-public-key", (c) => {
    return c.json({ publicKey: config.vapidPublicKey });
  });

  authed.post("/push/subscribe", async (c) => {
    let body: {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "JSON invalide" }, 400);
    }
    const endpoint = body.endpoint;
    const p256dh = body.keys?.p256dh;
    const auth = body.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      return c.json({ error: "subscription incomplète" }, 400);
    }
    upsertPushSubscription(endpoint, p256dh, auth, isoNow());
    return c.json({ ok: true });
  });

  authed.delete("/push/subscribe", async (c) => {
    let body: { endpoint?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "JSON invalide" }, 400);
    }
    if (body.endpoint) deletePushSubscription(body.endpoint);
    return c.json({ ok: true });
  });

  api.route("/", authed);
  return api;
}
