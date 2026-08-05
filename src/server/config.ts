import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import webpush from "web-push";
import { loadEnvFile } from "./load-env.js";

// Doit tourner avant toute lecture de process.env
loadEnvFile();


function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function ensureDataDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const photos = join(dir, "photos");
  if (!existsSync(photos)) mkdirSync(photos, { recursive: true });
}

function loadOrCreateVapid(dataDir: string): { publicKey: string; privateKey: string } {
  const envPub = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPriv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (envPub && envPriv) {
    return { publicKey: envPub, privateKey: envPriv };
  }

  const file = join(dataDir, "vapid.json");
  if (existsSync(file)) {
    return JSON.parse(readFileSync(file, "utf8")) as {
      publicKey: string;
      privateKey: string;
    };
  }

  const keys = webpush.generateVAPIDKeys();
  writeFileSync(file, JSON.stringify(keys, null, 2));
  console.log("[config] Generated VAPID keys at", file);
  return keys;
}

const dataDir = process.env.DATA_DIR || join(process.cwd(), "data");
ensureDataDir(dataDir);
const vapid = loadOrCreateVapid(dataDir);

export const config = {
  pin: process.env.PIN || "1234",
  sessionSecret: process.env.SESSION_SECRET || "dev-session-secret-change-me",
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || "",
  vapidPublicKey: vapid.publicKey,
  vapidPrivateKey: vapid.privateKey,
  vapidSubject: process.env.VAPID_SUBJECT || "mailto:admin@localhost",
  dataDir,
  photosDir: join(dataDir, "photos"),
  dbPath: join(dataDir, "app.db"),
  port: num("PORT", 3000),
  tz: process.env.TZ || "Europe/Paris",
  feedMorningHour: num("FEED_MORNING_HOUR", 9),
  feedEveningHour: num("FEED_EVENING_HOUR", 20),
  missGraceHours: num("MISS_GRACE_HOURS", 2),
  sessionDays: 14,
  isProd: process.env.NODE_ENV === "production",
} as const;

export type Slot = "morning" | "evening";

export function isSlot(value: string): value is Slot {
  return value === "morning" || value === "evening";
}
