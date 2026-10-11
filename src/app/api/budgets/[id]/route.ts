import { z } from "zod";
import { after } from "next/server";
import { currentMonthKey, dayIndex, isMonthKey, monthLabel, periodProgress, periodRange } from "@/lib/period";
import { requireUser } from "@/server/auth";
import { notFound, oid, readJson, route, searchParams } from "@/server/http";
import { Budget, Expense, type BudgetDoc, type ExpenseDoc } from "@/server/models";
import { budgetStatus, checkBudgetAlerts } from "@/server/services/budgets";
import { categoryMap, serializeExpense } from "@/server/services/expenses";

type Ctx = RouteContext<"/api/budgets/[id]">;

export const GET = route<Ctx>(async (req, ctx) => {
  const user = await requireUser();
  const id = oid((await ctx.params).id, "Budget not found.");
  const budget = await Budget.findOne({ _id: id, userId: user._id }).lean<BudgetDoc>();
  if (!budget) throw notFound("Budget not found.");
  const m = searchParams(req).get("month");
  const key = isMonthKey(m) ? m : currentMonthKey(user);
  const range = periodRange(key, user);
  const progress = periodProgress(range);
  const status = await budgetStatus(user, key);
  const item = [...(status.overall ? [status.overall] : []), ...status.categories].find((b) => b.id === String(id))!;

  const q: Record<string, unknown> = { userId: user._id, occurredAt: { $gte: range.start, $lt: range.end } };
  if (budget.categoryId) q.categoryId = budget.categoryId;
  const [list, cats] = await Promise.all([Expense.find(q).sort({ occurredAt: -1 }).lean<ExpenseDoc[]>(), categoryMap(user._id)]);

  const daily = new Array(range.days).fill(0);
  for (const e of list) {
    const i = dayIndex(new Date(e.occurredAt), range);
    if (i >= 0 && i < range.days) daily[i] += e.myShare;
  }
  let run = 0;
  const visible = progress.isCurrent ? progress.daysElapsed : range.days;
  const cumulative = daily.map((v, i) => ({ day: i + 1, spent: i < visible ? (run += v) : null, limit: budget.limit, pace: Math.round((budget.limit / range.days) * (i + 1)) }));

  const merchants = new Map<string, number>();
  for (const e of list) {
    const k = e.merchant || e.note || "Other";
    merchants.set(k, (merchants.get(k) ?? 0) + e.myShare);
  }

  return Response.json({
    monthKey: key,
    label: monthLabel(key),
    progress,
    budget: item,
    cumulative,
    topMerchants: [...merchants.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, total]) => ({ name, total })),
    expenses: list.slice(0, 50).map((e) => serializeExpense(e, cats)),
  });
});

const patchSchema = z.object({ limit: z.number().int().positive().optional(), alertAt: z.array(z.number().int().min(10).max(200)).min(1).max(4).optional() });

export const PATCH = route<Ctx>(async (req, ctx) => {
  const user = await requireUser();
  const id = oid((await ctx.params).id, "Budget not found.");
  const input = await readJson(req, patchSchema);
  const set: Record<string, unknown> = {};
  if (input.limit) set.limit = input.limit;
  if (input.alertAt) set.alertAt = [...input.alertAt].sort((a, b) => a - b);
  const res = await Budget.updateOne({ _id: id, userId: user._id }, { $set: set });
  if (!res.matchedCount) throw notFound("Budget not found.");
  after(() => checkBudgetAlerts(user, new Date()).catch(() => undefined));
  return Response.json({ ok: true });
});

export const DELETE = route<Ctx>(async (_req, ctx) => {
  const user = await requireUser();
  const id = oid((await ctx.params).id, "Budget not found.");
  await Budget.deleteOne({ _id: id, userId: user._id });
  return Response.json({ ok: true });
});
