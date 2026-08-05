import webpush from "web-push";
import { config, type Slot } from "./config.js";
import {
  deletePushSubscription,
  listPushSubscriptions,
} from "./db.js";

const slotLabel: Record<Slot, string> = {
  morning: "matin",
  evening: "soir",
};

let configured = false;

function ensurePush(): boolean {
  if (!config.vapidPublicKey || !config.vapidPrivateKey) {
    console.warn("[push] VAPID keys missing");
    return false;
  }
  if (!configured) {
    webpush.setVapidDetails(
      config.vapidSubject,
      config.vapidPublicKey,
      config.vapidPrivateKey,
    );
    configured = true;
  }
  return true;
}

export async function sendFeedReminder(slot: Slot): Promise<void> {
  if (!ensurePush()) return;

  const payload = JSON.stringify({
    title: "Repas des chiens",
    body: `N'oublie pas le repas du ${slotLabel[slot]} 🐶`,
    slot,
  });

  const subs = listPushSubscriptions();
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          deletePushSubscription(sub.endpoint);
        } else {
          console.error("[push] send failed", err);
        }
      }
    }),
  );
}
