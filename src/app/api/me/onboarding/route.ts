import { onboardingSchema } from "@/lib/schemas";
import { DEFAULT_CATEGORIES } from "@/lib/categories";
import { publicUser, requireUser } from "@/server/auth";
import { readJson, route } from "@/server/http";
import { Budget, Category, User, type UserDoc } from "@/server/models";

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await readJson(req, onboardingSchema);

  // Keep every default category so nothing is lost, but archive the ones the user didn't pick.
  const picked = new Set([...input.categoryKeys, "other"]);
  for (const def of DEFAULT_CATEGORIES) {
    await Category.updateOne(
      { userId: user._id, name: def.name },
      { $setOnInsert: { userId: user._id, name: def.name, icon: def.icon, color: def.color, isDefault: true }, $set: { archived: !picked.has(def.key) } },
      { upsert: true },
    );
  }
  if (input.overallBudget) {
    await Budget.updateOne({ userId: user._id, categoryId: null }, { $set: { limit: input.overallBudget } }, { upsert: true });
  }
  const updated = await User.findByIdAndUpdate(
    user._id,
    { $set: { currency: input.currency, monthStartDay: input.monthStartDay, onboarded: true } },
    { new: true },
  ).lean<UserDoc>();
  return Response.json({ user: publicUser(updated!) });
});
