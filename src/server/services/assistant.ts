import "server-only";
import { Types } from "mongoose";
import { formatMoney } from "@/lib/money";
import { extractCategory } from "@/lib/parser";
import { currentMonthKey, monthLabel, periodProgress, periodRange, shiftMonth, type PeriodRange } from "@/lib/period";
import { Expense, type ExpenseDoc, type UserDoc } from "../models";
import { computeHealth } from "./analytics";
import { budgetStatus, roundToUnit } from "./budgets";
import { categoryMap, serializeExpense } from "./expenses";
import { parseContextFor } from "./categories";
import { listGroups } from "./groups";

// Rule-based answers over the user's own data. Same response shape an LLM tool-calling
// assistant would produce, so a model can replace `answer()` later.

export interface AssistantReply {
  answer: string;
  chart?: { title: string; data: { label: string; value: number }[] };
  links?: { label: string; href: string }[];
  suggestions?: string[];
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

const SUGGESTIONS = [
  "How much did I spend on food this month?",
  "Compare this month with last month",
  "What's my biggest category?",
  "How much budget is left?",
  "What if I cut food by 20%?",
  "Will I stay under budget?",
];

function resolvePeriod(lower: string, user: UserDoc): { range: PeriodRange; label: string; key: string | null } {
  const now = new Date();
  const cur = currentMonthKey(user);
  const day = 86_400_000;
  if (/\btoday\b/.test(lower)) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { range: { key: "today", start, end: new Date(start.getTime() + day), days: 1 }, label: "today", key: null };
  }
  if (/\byesterday\b/.test(lower)) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setTime(start.getTime() - day);
    return { range: { key: "yesterday", start, end: new Date(start.getTime() + day), days: 1 }, label: "yesterday", key: null };
  }
  if (/\b(this|past|last 7 days|last) week\b/.test(lower)) {
    const start = new Date(now.getTime() - 7 * day);
    return { range: { key: "week", start, end: now, days: 7 }, label: "in the last 7 days", key: null };
  }
  if (/\blast month|previous month\b/.test(lower)) {
    const key = shiftMonth(cur, -1);
    return { range: periodRange(key, user), label: `in ${monthLabel(key)}`, key };
  }
  const mi = MONTHS.findIndex((m) => new RegExp(`\\b(in|for|during)?\\s*${m}\\b`).test(lower) || new RegExp(`\\b${m.slice(0, 3)}\\b`).test(lower));
  if (mi >= 0) {
    const [y, m] = cur.split("-").map(Number);
    const year = mi + 1 > m ? y - 1 : y;
    const key = `${year}-${String(mi + 1).padStart(2, "0")}`;
    return { range: periodRange(key, user), label: `in ${monthLabel(key)}`, key };
  }
  return { range: periodRange(cur, user), label: "this month", key: cur };
}

async function totalIn(user: UserDoc, range: PeriodRange, categoryId?: string) {
  const q: Record<string, unknown> = { userId: user._id, occurredAt: { $gte: range.start, $lt: range.end } };
  if (categoryId) q.categoryId = new Types.ObjectId(categoryId);
  const rows = await Expense.aggregate<{ total: number; count: number }>([
    { $match: q },
    { $group: { _id: null, total: { $sum: "$myShare" }, count: { $sum: 1 } } },
  ]);
  return { total: rows[0]?.total ?? 0, count: rows[0]?.count ?? 0 };
}

export async function answer(user: UserDoc, message: string): Promise<AssistantReply> {
  const lower = message.toLowerCase();
  const money = (m: number) => formatMoney(m, user.currency);
  const { ctx, byName } = await parseContextFor(user._id);
  const catHit = extractCategory(message, { categories: ctx.categories });
  const category = catHit.name ? byName.get(catHit.name.toLowerCase()) : undefined;
  const catId = category ? String(category._id) : undefined;
  const catName = category?.name;
  const period = resolvePeriod(lower, user);
  const curKey = currentMonthKey(user);

  // What-if scenarios: "what if I cut food by 20%" / "reduce shopping by 2000"
  if (/what if|if i (cut|reduce|spend less|save|skip)|scenario|could i save/.test(lower)) {
    const pct = lower.match(/(\d{1,3})\s*%/);
    const amt = lower.match(/(?:by|of)\s*(?:₹|rs\.?)?\s*(\d[\d,]*)(?!\s*%)/);
    const status = await budgetStatus(user, curKey);
    const projected = catId ? (status.projectedByCat.get(catId) ?? 0) : status.projectedTotal;
    const cut = roundToUnit(pct ? (projected * Number(pct[1])) / 100 : amt ? Number(amt[1].replace(/,/g, "")) * 100 : projected * 0.1);
    const after = Math.max(projected - cut, 0);
    const budget = catId ? status.categories.find((b) => b.categoryId === catId) : status.overall;
    const what = catName ?? "your spending";
    let text = `${catName ?? "Your spending"} is on pace for ${money(projected)} this month. Cutting ${pct ? `${pct[1]}%` : money(cut)} brings it to ${money(after)}, saving about ${money(cut)} a month, or ${money(cut * 12)} a year.`;
    if (budget) text += after <= budget.limit ? ` That keeps ${what} under its ${money(budget.limit)} budget.` : ` That is still ${money(after - budget.limit)} over its ${money(budget.limit)} budget.`;
    return {
      answer: text,
      chart: { title: "This month", data: [{ label: "On pace", value: projected }, { label: "After cut", value: after }, ...(budget ? [{ label: "Budget", value: budget.limit }] : [])] },
      links: [{ label: "Open budgets", href: "/budgets" }],
    };
  }

  if (/\b(owe|owes|owed|balance|balances|settle|split)\b/.test(lower)) {
    const groups = await listGroups(user._id);
    if (!groups.length) return { answer: "You don't have any split groups yet. Create one from Splits to share costs.", links: [{ label: "Open splits", href: "/splits" }] };
    const lines = groups.map((g) => (g.myBalance > 0 ? `${g.name}: you are owed ${money(g.myBalance)}` : g.myBalance < 0 ? `${g.name}: you owe ${money(-g.myBalance)}` : `${g.name}: all settled`));
    return { answer: lines.join(". ") + ".", links: groups.slice(0, 3).map((g) => ({ label: g.name, href: `/splits/${g.id}` })) };
  }

  if (/health|score|how am i doing|doing financially/.test(lower)) {
    const h = await computeHealth(user);
    return {
      answer: `Your financial health score is ${h.score} (${h.label}). ${h.tips[0] ?? ""}`,
      chart: { title: "Score breakdown", data: h.factors.map((f) => ({ label: f.name, value: f.points * 100 })) },
      links: [{ label: "See insights", href: "/insights" }],
    };
  }

  if (/forecast|predict|end of (the )?month|on track|projected|stay under|will i/.test(lower)) {
    const status = await budgetStatus(user, curKey);
    const projected = status.projectedTotal;
    let text = `At your current pace you'll spend about ${money(projected)} by the end of ${monthLabel(curKey)}.`;
    if (status.overall) text += projected <= status.overall.limit ? ` That's within your ${money(status.overall.limit)} budget.` : ` That's ${money(projected - status.overall.limit)} over your ${money(status.overall.limit)} budget.`;
    const risky = status.categories.filter((b) => b.projected > b.limit).map((b) => b.category?.name).filter(Boolean);
    if (risky.length) text += ` Watch ${risky.join(", ")}.`;
    return { answer: text, chart: { title: "This month", data: [{ label: "Spent", value: status.totalSpent }, { label: "Projected", value: projected }, ...(status.overall ? [{ label: "Budget", value: status.overall.limit }] : [])] } };
  }

  if (/budget|left|can i spend|remaining|allowance/.test(lower)) {
    const status = await budgetStatus(user, curKey);
    const b = catId ? status.categories.find((x) => x.categoryId === catId) : status.overall;
    if (!b) return { answer: catName ? `You haven't set a budget for ${catName}.` : "You haven't set an overall budget yet.", links: [{ label: "Set a budget", href: "/budgets" }] };
    const daysLeft = Math.max(status.progress.daysLeft, 1);
    const left = b.left;
    const text =
      left >= 0
        ? `You have ${money(left)} left of your ${money(b.limit)} ${catName ?? "overall"} budget, about ${money(Math.floor(left / daysLeft))} a day for the next ${daysLeft} days.`
        : `You're ${money(-left)} over your ${money(b.limit)} ${catName ?? "overall"} budget this month.`;
    return { answer: text, chart: { title: catName ?? "Overall", data: [{ label: "Spent", value: b.spent }, { label: "Budget", value: b.limit }] }, links: [{ label: "Open budgets", href: b.id ? `/budgets/${b.id}` : "/budgets" }] };
  }

  if (/compare|\bvs\b|versus|than last|more than|less than|difference/.test(lower)) {
    const cur = periodRange(curKey, user);
    const prevKey = shiftMonth(curKey, -1);
    const prev = periodRange(prevKey, user);
    const [a, b] = await Promise.all([totalIn(user, cur, catId), totalIn(user, prev, catId)]);
    const diff = a.total - b.total;
    const what = catName ? `on ${catName}` : "in total";
    const text = b.total
      ? `You've spent ${money(a.total)} ${what} in ${monthLabel(curKey)} vs ${money(b.total)} in ${monthLabel(prevKey)}, ${diff >= 0 ? `${money(diff)} more` : `${money(-diff)} less`} (${diff >= 0 ? "+" : ""}${Math.round((diff / b.total) * 100)}%).`
      : `You've spent ${money(a.total)} ${what} in ${monthLabel(curKey)}. There's nothing to compare in ${monthLabel(prevKey)}.`;
    return { answer: text, chart: { title: catName ?? "Total", data: [{ label: monthLabel(prevKey, true), value: b.total }, { label: monthLabel(curKey, true), value: a.total }] }, links: [{ label: "Open reports", href: "/reports" }] };
  }

  if (/(biggest|largest|most expensive|highest).*(expense|purchase|transaction|spend)/.test(lower)) {
    const q: Record<string, unknown> = { userId: user._id, occurredAt: { $gte: period.range.start, $lt: period.range.end } };
    const top = await Expense.find(q).sort({ myShare: -1 }).limit(3).lean<ExpenseDoc[]>();
    if (!top.length) return { answer: `No expenses ${period.label} yet.` };
    const cats = await categoryMap(user._id);
    const items = top.map((e) => serializeExpense(e, cats));
    return {
      answer: `Your biggest expense ${period.label} was ${items[0].title} at ${money(items[0].myShare)}.`,
      chart: { title: "Largest expenses", data: items.map((i) => ({ label: i.title, value: i.myShare })) },
      links: items.map((i) => ({ label: i.title, href: `/activity/${i.id}` })),
    };
  }

  if (/(top|biggest|most|highest|main).*(categor|spend|money go)|where.*(money|spend)/.test(lower)) {
    const rows = await Expense.aggregate<{ _id: string; total: number }>([
      { $match: { userId: user._id, occurredAt: { $gte: period.range.start, $lt: period.range.end } } },
      { $group: { _id: "$categoryId", total: { $sum: "$myShare" } } },
      { $sort: { total: -1 } },
      { $limit: 5 },
    ]);
    if (!rows.length) return { answer: `No expenses ${period.label} yet.` };
    const cats = await categoryMap(user._id);
    const data = rows.map((r) => ({ label: cats.get(String(r._id))?.name ?? "Other", value: r.total }));
    return { answer: `Your biggest category ${period.label} is ${data[0].label} at ${money(data[0].value)}.`, chart: { title: `Top categories ${period.label}`, data } };
  }

  if (/average|per day|daily/.test(lower)) {
    const { total } = await totalIn(user, period.range, catId);
    const progress = periodProgress(period.range);
    const days = Math.max(progress.daysElapsed, 1);
    return { answer: `You've averaged ${money(Math.round(total / days))} a day ${catName ? `on ${catName} ` : ""}${period.label}.` };
  }

  if (/how much|spent|spend|total|cost/.test(lower)) {
    const { total, count } = await totalIn(user, period.range, catId);
    return {
      answer: `You spent ${money(total)} ${catName ? `on ${catName} ` : ""}${period.label} across ${count} expense${count === 1 ? "" : "s"}.`,
      links: [{ label: "See transactions", href: `/activity${period.key ? `?month=${period.key}` : ""}${catId ? `${period.key ? "&" : "?"}category=${catId}` : ""}` }],
    };
  }

  return {
    answer: "I can answer questions about your spending, budgets, splits and trends. Try one of these:",
    suggestions: SUGGESTIONS,
  };
}

export { SUGGESTIONS };
