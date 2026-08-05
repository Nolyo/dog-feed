import { config } from "./config.js";

/** YYYY-MM-DD in configured timezone (Europe/Paris by default). */
export function todayDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: config.tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Human-readable timestamp for watermark, in configured timezone. */
export function nowLabel(): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: config.tz,
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date());
}

export function isoNow(): string {
  return new Date().toISOString();
}
