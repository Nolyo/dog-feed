import { readFileSync } from "node:fs";
import { config, type Slot } from "./config.js";

const slotLabel: Record<Slot, string> = {
  morning: "matin",
  evening: "soir",
};

export async function notifyFeedingDone(
  feedDate: string,
  slot: Slot,
  photoAbsolutePath: string,
): Promise<void> {
  if (!config.discordWebhookUrl) {
    console.warn("[discord] DISCORD_WEBHOOK_URL not set — skip done notify");
    return;
  }

  const content = `✅ Repas du **${slotLabel[slot]}** validé (${feedDate})`;
  const bytes = readFileSync(photoAbsolutePath);
  const form = new FormData();
  form.append(
    "payload_json",
    JSON.stringify({
      content,
      username: "Dog Feed",
    }),
  );
  form.append(
    "files[0]",
    new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }),
    `${feedDate}-${slot}.jpg`,
  );

  const res = await fetch(config.discordWebhookUrl, { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[discord] done notify failed", res.status, text);
  }
}

export async function notifyMissed(feedDate: string, slot: Slot): Promise<void> {
  if (!config.discordWebhookUrl) {
    console.warn("[discord] DISCORD_WEBHOOK_URL not set — skip miss notify");
    return;
  }

  const content = `⚠️ **Oubli** : repas du **${slotLabel[slot]}** pas encore validé (${feedDate})`;
  const res = await fetch(config.discordWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, username: "Dog Feed" }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[discord] miss notify failed", res.status, text);
  }
}
