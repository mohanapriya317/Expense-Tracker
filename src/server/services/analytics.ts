import "server-only";
import type { Types } from "mongoose";
import { formatMoney } from "@/lib/money";
import { currentMonthKey, dayIndex, monthLabel, periodProgress, periodRange, shiftMonth, type PeriodRange } from "@/lib/period";
import { Expense, type CategoryDoc, type ExpenseDoc, type UserDoc } from "../models";
import { budgetStatus, roundToUnit } from "./budgets";
import { categoryMap, serializeExpense } from "./expenses";

const DISCRETIONARY = new Set(["food", "shopping", "entertainment", "travel"]);

async function expensesIn(userId: Types.ObjectId, range: PeriodRange) {
  return Expense.find({ userId, occurredAt: { $gte: range.start, $lt: range.end } })
    .select({ myShare: 1, amount: 1, categoryId: 1, occurredAt: 1, merchant: 1, createdAt: 1 })
    .lean<ExpenseDoc[]>();
}

function sum(list: ExpenseDoc[]) {
  return list.reduce((s, e) => s + e.myShare, 0);
}

function byCategory(list: ExpenseDoc[], cats: Map<string, CategoryDoc>) {
  const m = new Map<string, number>();
  for (const e of list) m.set(String(e.categoryId), (m.get(String(e.categoryId)) ?? 0) + e.myShare);
  return [...m.entries()]
    .map(([id, total]) => {
      const c = cats.get(id);
      return { categoryId: id, name: c?.name ?? "Unknown", color: c?.color ?? "#94A3B8", icon: c?.icon ?? "circle-ellipsis", total };
    })
    .sort((a, b) => b.total - a.total);
}

function cumulativeDaily(list: ExpenseDoc[], range: PeriodRange) {
  const days = new Array(range.days).fill(0);
  for (const e of list) {
    const i = dayIndex(new Date(e.occurredAt), range);
    if (i >= 0 && i < range.days) days[i] += e.myShare;
  }
  let run = 0;
  return days.map((v) => (run += v));
}

function pctChange(cur: number, prev: number) {
  if (!prev) return cur ? null : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

export async function getDashboard(user: UserDoc, monthKey?: string) {
  const key = monthKey ?? currentMonthKey(user);
  const range = periodRange(key, user);
  const prevRange = periodRange(shiftMonth(key, -1), user);
  const [cur, prev, cats, budgets, recent, health] = await Promise.all([
    expensesIn(user._id, range),
    expensesIn(user._id, prevRange),
    categoryMap(user._id),
    budgetStatus(user, key),
    Expense.find({ userId: user._id, occurredAt: { $lt: range.end } }).sort({ occurredAt: -1 }).limit(5).lean<ExpenseDoc[]>(),
    computeHealth(user),
  ]);
  const progress = periodProgress(range);
  const total = sum(cur);
  const prevTotal = sum(prev);
  const curDaily = cumulativeDaily(cur, range);
  const prevDaily = cumulativeDaily(prev, prevRange);
  const visibleDays = progress.isCurrent ? progress.daysElapsed : range.days;

  const alerts = [...(budgets.overall ? [budgets.overall] : []), ...budgets.categories]
    .filter((b) => b.state !== "safe")
    .map((b) => ({ id: b.id, name: b.category?.name ?? "Overall", pct: b.pct, state: b.state, left: b.left, limit: b.limit }));

  return {
    monthKey: key,
    label: monthLabel(key),
    range: { start: range.start, end: range.end, days: range.days },
    progress,
    total,
    count: cur.length,
    prevTotal,
    changePct: pctChange(total, prevTotal),
    overallBudget: budgets.overall,
    categoryBudgets: budgets.categories.slice(0, 6),
    alerts,
    byCategory: byCategory(cur, cats),
    daily: Array.from({ length: range.days }, (_, i) => ({
      day: i + 1,
      current: i < visibleDays ? curDaily[i] : null,
      previous: prevDaily[Math.min(i, prevDaily.length - 1)] ?? null,
    })),
    recent: recent.map((e) => serializeExpense(e, cats)),
    health: { score: health.score, label: health.label, tip: health.tips[0] ?? null },
  };
}

export async function computeHealth(user: UserDoc) {
  const key = currentMonthKey(user);
  const range = periodRange(key, user);
  const prevKeys = [1, 2, 3].map((n) => shiftMonth(key, -n));
  const [cur, cats, budgets, ...prevLists] = await Promise.all([
    expensesIn(user._id, range),
    categoryMap(user._id),
    budgetStatus(user, key),
    ...prevKeys.map((k) => expensesIn(user._id, periodRange(k, user))),
  ]);
  const total = sum(cur);
  const projected = budgets.projectedTotal;
  const prevTotals = prevLists.map(sum);
  const history = prevTotals.filter((t) => t > 0);
  const avgPrev = history.length ? roundToUnit(history.reduce((a, b) => a + b, 0) / history.length) : 0;

  const factors: { name: string; points: number; max: number; detail: string }[] = [];

  // 1. Budget adherence (40)
  const allBudgets = [...(budgets.overall ? [budgets.overall] : []), ...budgets.categories];
  if (allBudgets.length) {
    const scores = allBudgets.map((b): number => {
      const p = (b.projected / b.limit) * 100;
      return p <= 100 ? 1 : p <= 120 ? 0.5 : 0;
    });
    const pts = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 40);
    const atRisk = allBudgets.filter((b) => b.projected > b.limit).length;
    factors.push({ name: "Budgets", points: pts, max: 40, detail: atRisk ? `${atRisk} of ${allBudgets.length} budgets are on track to overspend.` : "All budgets are on track." });
  } else {
    factors.push({ name: "Budgets", points: 20, max: 40, detail: "Set a monthly budget to get full credit here." });
  }

  // 2. Trend vs your 3-month average (25)
  if (avgPrev) {
    const ratio = projected / avgPrev;
    const pts = ratio <= 1 ? 25 : ratio <= 1.1 ? 15 : ratio <= 1.3 ? 8 : 0;
    const diff = Math.round((ratio - 1) * 100);
    factors.push({ name: "Spending trend", points: pts, max: 25, detail: diff <= 0 ? `On pace to spend ${Math.abs(diff)}% less than your 3-month average.` : `On pace to spend ${diff}% more than your 3-month average.` });
  } else {
    factors.push({ name: "Spending trend", points: 15, max: 25, detail: "Not enough history yet; this improves after a full month." });
  }

  // 3. Discretionary share (15)
  const cat = byCategory(cur, cats);
  const discretionary = cat.filter((c) => DISCRETIONARY.has(c.name.toLowerCase())).reduce((s, c) => s + c.total, 0);
  const share = total ? discretionary / total : 0;
  factors.push({
    name: "Wants vs needs",
    points: share <= 0.35 ? 15 : share <= 0.5 ? 8 : 3,
    max: 15,
    detail: `${Math.round(share * 100)}% of this month went to food, shopping, entertainment and travel.`,
  });

  // 4. Tracking consistency (20)
  const twoWeeksAgo = new Date(Date.now() - 14 * 86_400_000);
  const loggedDays = await Expense.aggregate<{ _id: string }>([
    { $match: { userId: user._id, occurredAt: { $gte: twoWeeksAgo } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$occurredAt" } } } },
  ]);
  const n = loggedDays.length;
  factors.push({ name: "Tracking habit", points: n >= 10 ? 20 : n >= 5 ? 12 : n >= 1 ? 5 : 0, max: 20, detail: `You logged expenses on ${n} of the last 14 days.` });

  const score = Math.max(0, Math.min(100, factors.reduce((s, f) => s + f.points, 0)));
  const label = score >= 80 ? "Excellent" : score >= 65 ? "Good" : score >= 45 ? "Fair" : "Needs attention";

  // Tips: the biggest overspend risk first, then the fastest-growing category.
  const tips: string[] = [];
  const prevCat = byCategory(prevLists[0] ?? [], cats);
  for (const b of budgets.categories.filter((b) => b.projected > b.limit).slice(0, 2)) {
    const cut = b.projected - b.limit;
    tips.push(`Cutting ${b.category?.name ?? "spending"} by ${formatMoney(cut, user.currency)} keeps you under its budget this month.`);
  }
  const growth = cat
    .map((c) => {
      const p = prevCat.find((x) => x.categoryId === c.categoryId)?.total ?? 0;
      const projectedCat = budgets.projectedByCat.get(c.categoryId) ?? c.total;
      return { name: c.name, change: p ? (projectedCat - p) / p : 0, p };
    })
    .filter((g) => g.p > 0 && g.change > 0.2)
    .sort((a, b) => b.change - a.change)[0];
  if (growth) tips.push(`${growth.name} is on pace to be ${Math.round(growth.change * 100)}% higher than last month.`);
  if (!allBudgets.length) tips.push("Add a monthly budget so we can warn you before you overspend.");
  if (!tips.length) tips.push("You're on track. Keep logging daily to keep your score up.");

  // Forecasts
  const nextMonth = roundToUnit(
    history.length ? (prevTotals[0] * 0.5 + (prevTotals[1] || prevTotals[0]) * 0.3 + (prevTotals[2] || prevTotals[0]) * 0.2 + projected) / 2 : projected,
  );
  const categoryForecast = cat.slice(0, 8).map((c) => {
    const b = budgets.categories.find((x) => x.categoryId === c.categoryId);
    const proj = budgets.projectedByCat.get(c.categoryId) ?? c.total;
    return { name: c.name, color: c.color, spent: c.total, projected: proj, limit: b?.limit ?? null };
  });

  return {
    monthKey: key,
    score,
    label,
    factors,
    tips,
    forecast: {
      spent: total,
      projected,
      budget: budgets.overall?.limit ?? null,
      avgPrev,
      nextMonth,
      history: [...prevKeys].reverse().map((k, i) => ({ month: monthLabel(k, true), total: [...prevTotals].reverse()[i] })).concat([{ month: monthLabel(key, true), total }]),
      categories: categoryForecast,
    },
  };
}

export async function getMonthReport(user: UserDoc, key: string) {
  const range = periodRange(key, user);
  const prevKey = shiftMonth(key, -1);
  const prevRange = periodRange(prevKey, user);
  const [cur, prev, cats, full] = await Promise.all([
    expensesIn(user._id, range),
    expensesIn(user._id, prevRange),
    categoryMap(user._id),
    Expense.find({ userId: user._id, occurredAt: { $gte: range.start, $lt: range.end } }).sort({ occurredAt: 1 }).lean<ExpenseDoc[]>(),
  ]);
  const curCat = byCategory(cur, cats);
  const prevCat = byCategory(prev, cats);
  const ids = new Set([...curCat, ...prevCat].map((c) => c.categoryId));
  const categories = [...ids]
    .map((id) => {
      const c = curCat.find((x) => x.categoryId === id);
      const p = prevCat.find((x) => x.categoryId === id);
      const meta = c ?? p!;
      const current = c?.total ?? 0;
      const previous = p?.total ?? 0;
      return { categoryId: id, name: meta.name, color: meta.color, current, previous, change: current - previous, changePct: pctChange(current, previous) };
    })
    .sort((a, b) => b.current - a.current);

  const merchants = new Map<string, number>();
  for (const e of cur) if (e.merchant) merchants.set(e.merchant, (merchants.get(e.merchant) ?? 0) + e.myShare);

  const total = sum(cur);
  const prevTotal = sum(prev);
  const progress = periodProgress(range);
  return {
    monthKey: key,
    label: monthLabel(key),
    prevLabel: monthLabel(prevKey),
    total,
    prevTotal,
    changePct: pctChange(total, prevTotal),
    count: cur.length,
    avgPerDay: Math.round(total / Math.max(progress.daysElapsed, 1)),
    categories,
    biggestChanges: [...categories].sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 3),
    topMerchants: [...merchants.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, total]) => ({ name, total })),
    transactions: full.map((e) => serializeExpense(e, cats)),
  };
}

export type MonthReport = Awaited<ReturnType<typeof getMonthReport>>;
