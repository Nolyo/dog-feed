import cron from "node-cron";
import { config, type Slot } from "./config.js";
import { todayDate, isoNow } from "./dates.js";
import { getFeeding, hasMissAlert, insertMissAlert } from "./db.js";
import { notifyMissed } from "./discord.js";
import { sendFeedReminder } from "./push.js";

function hourExpr(hour: number): string {
  const h = Math.max(0, Math.min(23, Math.floor(hour)));
  return `0 ${h} * * *`;
}

async function maybeRemind(slot: Slot): Promise<void> {
  const date = todayDate();
  if (getFeeding(date, slot)) return;
  console.log(`[jobs] push reminder ${slot} ${date}`);
  await sendFeedReminder(slot);
}

async function maybeMiss(slot: Slot): Promise<void> {
  const date = todayDate();
  if (getFeeding(date, slot)) return;
  if (hasMissAlert(date, slot)) return;
  const inserted = insertMissAlert(date, slot, isoNow());
  if (!inserted) return;
  console.log(`[jobs] discord miss ${slot} ${date}`);
  await notifyMissed(date, slot);
}

export function startJobs(): void {
  const morning = config.feedMorningHour;
  const evening = config.feedEveningHour;
  const missMorning = (morning + config.missGraceHours) % 24;
  const missEvening = (evening + config.missGraceHours) % 24;
  const tz = config.tz;

  cron.schedule(hourExpr(morning), () => void maybeRemind("morning"), { timezone: tz });
  cron.schedule(hourExpr(evening), () => void maybeRemind("evening"), { timezone: tz });
  cron.schedule(hourExpr(missMorning), () => void maybeMiss("morning"), { timezone: tz });
  cron.schedule(hourExpr(missEvening), () => void maybeMiss("evening"), { timezone: tz });

  console.log(
    `[jobs] scheduled reminders ${morning}h/${evening}h, miss ${missMorning}h/${missEvening}h (${tz})`,
  );
}
