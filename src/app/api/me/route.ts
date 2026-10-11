import { profileSchema } from "@/lib/schemas";
import { endSession, publicUser, requireUser } from "@/server/auth";
import { readJson, route } from "@/server/http";
import { Budget, Category, CategoryRule, Expense, Group, Notification, Receipt, User, type UserDoc } from "@/server/models";
import { ensureDefaultCategories } from "@/server/services/categories";
import { deleteUserFiles } from "@/server/services/receipts";

export const GET = route(async () => {
  const user = await requireUser();
  await ensureDefaultCategories(user._id);
  const unread = await Notification.countDocuments({ userId: user._id, readAt: null });
  return Response.json({ user: publicUser(user), unreadNotifications: unread });
});

export const PATCH = route(async (req) => {
  const user = await requireUser();
  const input = await readJson(req, profileSchema);
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    if (k === "notificationPrefs") {
      for (const [pk, pv] of Object.entries(v as Record<string, boolean>)) set[`notificationPrefs.${pk}`] = pv;
    } else set[k] = v;
  }
  const updated = await User.findByIdAndUpdate(user._id, { $set: set }, { new: true }).lean<UserDoc>();
  return Response.json({ user: publicUser(updated!) });
});

/** Permanently deletes the account and every document and file it owns. */
export const DELETE = route(async () => {
  const user = await requireUser();
  const userId = user._id;
  await Promise.all([
    Expense.deleteMany({ userId }),
    Category.deleteMany({ userId }),
    CategoryRule.deleteMany({ userId }),
    Budget.deleteMany({ userId }),
    Notification.deleteMany({ userId }),
    Receipt.deleteMany({ userId }),
    Group.deleteMany({ ownerId: userId }),
  ]);
  await deleteUserFiles(userId);
  await User.deleteOne({ _id: userId });
  await endSession();
  return Response.json({ ok: true });
});
