import { Types } from "mongoose";
import { after } from "next/server";
import { budgetSchema } from "@/lib/schemas";
import { currentMonthKey, isMonthKey, monthLabel } from "@/lib/period";
import { requireUser } from "@/server/auth";
import { badRequest, readJson, route, searchParams } from "@/server/http";
import { Budget, Category } from "@/server/models";
import { budgetStatus, checkBudgetAlerts } from "@/server/services/budgets";

export const GET = route(async (req) => {
  const user = await requireUser();
  const m = searchParams(req).get("month");
  const key = isMonthKey(m) ? m : currentMonthKey(user);
  const s = await budgetStatus(user, key);
  return Response.json({
    monthKey: key,
    label: monthLabel(key),
    progress: s.progress,
    totalSpent: s.totalSpent,
    overall: s.overall,
    categories: s.categories,
  });
});

/** Create or replace the budget for a category (or the overall budget when categoryId is null). */
export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await readJson(req, budgetSchema);
  if (input.categoryId && !(await Category.exists({ _id: input.categoryId, userId: user._id }))) throw badRequest("Pick one of your categories.");
  const categoryId = input.categoryId ? new Types.ObjectId(input.categoryId) : null;
  await Budget.updateOne(
    { userId: user._id, categoryId },
    { $set: { limit: input.limit, ...(input.alertAt ? { alertAt: [...input.alertAt].sort((a, b) => a - b) } : {}) } },
    { upsert: true },
  );
  after(() => checkBudgetAlerts(user, new Date()).catch(() => undefined));
  return Response.json({ ok: true }, { status: 201 });
});
