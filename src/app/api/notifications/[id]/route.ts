import { requireUser } from "@/server/auth";
import { oid, route } from "@/server/http";
import { Notification } from "@/server/models";

type Ctx = RouteContext<"/api/notifications/[id]">;

export const PATCH = route<Ctx>(async (_req, ctx) => {
  const user = await requireUser();
  const id = oid((await ctx.params).id, "Notification not found.");
  await Notification.updateOne({ _id: id, userId: user._id }, { $set: { readAt: new Date() } });
  return Response.json({ ok: true });
});

export const DELETE = route<Ctx>(async (_req, ctx) => {
  const user = await requireUser();
  const id = oid((await ctx.params).id, "Notification not found.");
  await Notification.deleteOne({ _id: id, userId: user._id });
  return Response.json({ ok: true });
});
