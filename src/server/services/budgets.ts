import "server-only";
import type { Types } from "mongoose";
import { formatMoney } from "@/lib/money";
import { currentMonthKey, monthLabel, periodProgress, periodRange, type PeriodRange } from "@/lib/period";
import { Budget, Category, Expense, type BudgetDoc, type CategoryDoc, type UserDoc } from "../models";
import { notify } from "./notify";

export async function spendByCategory(userId: Types.ObjectId, range: PeriodRange) {
  const rows = await Expense.aggregate<{ _id: Types.ObjectId; total: number; count: number }>([
    { $match: { userId, occurredAt: { $gte: range.start, $lt: range.end } } },
    { $group: { _id: "$categoryId", total: { $sum: "$myShare" }, count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), { total: r.total, count: r.count }]));
}

// Monthly fixed costs: paid once a month, so they are not extrapolated by day.
const FIXED_CATEGORIES = new Set(["rent", "bills", "education"]);

export function roundToUnit(minor: number) {
  return Math.round(minor / 100) * 100;
}

/**
 * End-of-period projection per category: variable spending continues at this period's
 * daily rate, fixed monthly costs stay as they are.
 */
export function projectSpend(
  spend: Map<string, { total: number }>,
  catById: Map<string, { name: string }>,
  progress: { daysElapsed: number; daysLeft: number; isCurrent: boolean },
) {
  const byCat = new Map<string, number>();
  let total = 0;
  for (const [id, { total: spent }] of spend) {
    const fixed = FIXED_CATEGORIES.has((catById.get(id)?.name ?? "").toLowerCase());
    const projected = !progress.isCurrent || fixed ? spent : roundToUnit(spent + (spent / Math.max(progress.daysElapsed, 1)) * progress.daysLeft);
    byCat.set(id, projected);
    total += projected;
  }
  return { byCat, total };
}

export type BudgetState = "safe" | "warning" | "over";

export function stateFor(pct: number, alertAt: number[] = [80, 100]): BudgetState {
  const warn = Math.min(...alertAt);
  if (pct >= 100) return "over";
  if (pct >= warn) return "warning";
  return "safe";
}

export async function budgetStatus(user: UserDoc, monthKey: string) {
  const range = periodRange(monthKey, user);
  const progress = periodProgress(range);
  const [budgets, spend, cats] = await Promise.all([
    Budget.find({ userId: user._id }).lean<BudgetDoc[]>(),
    spendByCategory(user._id, range),
    Category.find({ userId: user._id }).lean<CategoryDoc[]>(),
  ]);
  const catById = new Map(cats.map((c) => [String(c._id), c]));
  const totalSpent = [...spend.values()].reduce((s, v) => s + v.total, 0);
  const projection = projectSpend(spend, catById, progress);

  const items = budgets.map((b) => {
    const cat = b.categoryId ? catById.get(String(b.categoryId)) : null;
    const spent = b.categoryId ? (spend.get(String(b.categoryId))?.total ?? 0) : totalSpent;
    const pct = Math.round((spent / b.limit) * 100);
    const projected = b.categoryId ? (projection.byCat.get(String(b.categoryId)) ?? spent) : projection.total;
    return {
      id: String(b._id),
      categoryId: b.categoryId ? String(b.categoryId) : null,
      category: cat ? { id: String(cat._id), name: cat.name, icon: cat.icon, color: cat.color } : null,
      limit: b.limit,
      alertAt: b.alertAt,
      spent,
      left: b.limit - spent,
      pct,
      projected,
      state: stateFor(pct, b.alertAt),
    };
  });
  const overall = items.find((i) => !i.categoryId) ?? null;
  const categories = items.filter((i) => i.categoryId).sort((a, b) => b.pct - a.pct);
  return { monthKey, range, progress, totalSpent, projectedTotal: projection.total, projectedByCat: projection.byCat, overall, categories };
}

/** Runs after an expense is saved or changed: raises 80% / 100% alerts once per period. */
export async function checkBudgetAlerts(user: UserDoc, when: Date) {
  const key = currentMonthKey(user, when);
  const status = await budgetStatus(user, key);
  const all = [...(status.overall ? [status.overall] : []), ...status.categories];
  for (const b of all) {
    const thresholds = [...b.alertAt].sort((x, y) => y - x);
    const hit = thresholds.find((t) => b.pct >= t);
    if (hit === undefined) continue;
    const name = b.category?.name ?? "Overall";
    const exceeded = hit >= 100;
    await notify(user, {
      key: `budget:${b.id}:${key}:${hit}`,
      type: exceeded ? "budget-exceeded" : "budget-warning",
      title: exceeded ? `${name} budget exceeded` : `${name} is at ${b.pct}% of its budget`,
      body: exceeded
        ? `You have spent ${formatMoney(b.spent, user.currency)} of ${formatMoney(b.limit, user.currency)} in ${monthLabel(key)}.`
        : `${formatMoney(Math.max(b.left, 0), user.currency)} left for ${monthLabel(key)}.`,
      link: `/budgets/${b.id}`,
    });
  }
}
