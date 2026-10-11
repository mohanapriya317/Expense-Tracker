import { requireUser } from "@/server/auth";
import { route } from "@/server/http";
import { Notification, type NotificationDoc } from "@/server/models";
import { serializeNotification } from "@/server/services/notify";

export const GET = route(async () => {
  const user = await requireUser();
  const items = await Notification.find({ userId: user._id }).sort({ createdAt: -1 }).limit(100).lean<NotificationDoc[]>();
  return Response.json({ notifications: items.map(serializeNotification), unread: items.filter((n) => !n.readAt).length });
});

/** Mark every notification as read. */
export const POST = route(async () => {
  const user = await requireUser();
  await Notification.updateMany({ userId: user._id, readAt: null }, { $set: { readAt: new Date() } });
  return Response.json({ ok: true });
});
