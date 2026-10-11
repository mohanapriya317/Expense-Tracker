import "server-only";
import type { NotificationDoc, UserDoc } from "../models";
import { Notification } from "../models";

interface NotifyInput {
  key: string;
  type: NotificationDoc["type"];
  title: string;
  body?: string;
  link?: string;
}

/**
 * Creates an in-app notification once per key and sends it by email when enabled.
 * Email delivery is a log line until a provider (Resend, SES) is configured.
 */
export async function notify(user: UserDoc, input: NotifyInput): Promise<boolean> {
  const res = await Notification.updateOne(
    { userId: user._id, key: input.key },
    { $setOnInsert: { userId: user._id, ...input, body: input.body ?? "", link: input.link ?? "" } },
    { upsert: true },
  );
  const created = res.upsertedCount > 0;
  if (created && user.notificationPrefs?.email) {
    console.info(`[email] to=${user.email} subject="${input.title}" body="${input.body ?? ""}"`);
  }
  return created;
}

export function serializeNotification(n: NotificationDoc) {
  return {
    id: String(n._id),
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    readAt: n.readAt,
    createdAt: (n as unknown as { createdAt: Date }).createdAt,
  };
}
