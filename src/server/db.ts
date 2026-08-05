import Database from "better-sqlite3";
import { config, type Slot } from "./config.js";

export type Feeding = {
  id: number;
  feed_date: string;
  slot: Slot;
  photo_path: string;
  created_at: string;
};

export type PushSubscriptionRow = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
};

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(config.dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    migrate(db);
  }
  return db;
}

function migrate(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS feedings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_date TEXT NOT NULL,
      slot TEXT NOT NULL CHECK (slot IN ('morning', 'evening')),
      photo_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (feed_date, slot)
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS miss_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_date TEXT NOT NULL,
      slot TEXT NOT NULL CHECK (slot IN ('morning', 'evening')),
      sent_at TEXT NOT NULL,
      UNIQUE (feed_date, slot)
    );
  `);
}

export function getFeeding(feedDate: string, slot: Slot): Feeding | undefined {
  return getDb()
    .prepare(
      `SELECT id, feed_date, slot, photo_path, created_at
       FROM feedings WHERE feed_date = ? AND slot = ?`,
    )
    .get(feedDate, slot) as Feeding | undefined;
}

export function listFeedingsSince(feedDateFrom: string): Feeding[] {
  return getDb()
    .prepare(
      `SELECT id, feed_date, slot, photo_path, created_at
       FROM feedings WHERE feed_date >= ?
       ORDER BY feed_date DESC, slot ASC`,
    )
    .all(feedDateFrom) as Feeding[];
}

export function insertFeeding(
  feedDate: string,
  slot: Slot,
  photoPath: string,
  createdAt: string,
): Feeding {
  const result = getDb()
    .prepare(
      `INSERT INTO feedings (feed_date, slot, photo_path, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(feedDate, slot, photoPath, createdAt);

  return {
    id: Number(result.lastInsertRowid),
    feed_date: feedDate,
    slot,
    photo_path: photoPath,
    created_at: createdAt,
  };
}

export function upsertPushSubscription(
  endpoint: string,
  p256dh: string,
  auth: string,
  createdAt: string,
): void {
  getDb()
    .prepare(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         p256dh = excluded.p256dh,
         auth = excluded.auth`,
    )
    .run(endpoint, p256dh, auth, createdAt);
}

export function deletePushSubscription(endpoint: string): void {
  getDb().prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).run(endpoint);
}

export function listPushSubscriptions(): PushSubscriptionRow[] {
  return getDb()
    .prepare(
      `SELECT id, endpoint, p256dh, auth, created_at FROM push_subscriptions`,
    )
    .all() as PushSubscriptionRow[];
}

export function hasMissAlert(feedDate: string, slot: Slot): boolean {
  const row = getDb()
    .prepare(`SELECT 1 AS ok FROM miss_alerts WHERE feed_date = ? AND slot = ?`)
    .get(feedDate, slot) as { ok: number } | undefined;
  return Boolean(row);
}

export function insertMissAlert(
  feedDate: string,
  slot: Slot,
  sentAt: string,
): boolean {
  try {
    getDb()
      .prepare(
        `INSERT INTO miss_alerts (feed_date, slot, sent_at) VALUES (?, ?, ?)`,
      )
      .run(feedDate, slot, sentAt);
    return true;
  } catch {
    return false;
  }
}
