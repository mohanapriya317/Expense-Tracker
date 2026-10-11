import "server-only";
import { Types } from "mongoose";
import { after } from "next/server";
import type { z } from "zod";
import { isMonthKey, periodRange } from "@/lib/period";
import type { expenseSchema, expenseUpdateSchema } from "@/lib/schemas";
import { badRequest, notFound } from "../http";
import { Category, Expense, Group, Receipt, type CategoryDoc, type ExpenseDoc, type GroupDoc, type UserDoc } from "../models";
import { checkBudgetAlerts } from "./budgets";
import { learnRule } from "./categories";

export function serializeExpense(e: ExpenseDoc, cats?: Map<string, CategoryDoc>) {
  const cat = cats?.get(String(e.categoryId));
  return {
    id: String(e._id),
    amount: e.amount,
    myShare: e.myShare,
    currency: e.currency,
    categoryId: String(e.categoryId),
    category: cat ? { id: String(cat._id), name: cat.name, icon: cat.icon, color: cat.color } : null,
    merchant: e.merchant,
    note: e.note,
    title: e.merchant || e.note || cat?.name || "Expense",
    occurredAt: e.occurredAt,
    paymentMethod: e.paymentMethod,
    source: e.source,
    receiptId: e.receiptId ? String(e.receiptId) : null,
    split: e.split
      ? {
          groupId: e.split.groupId ? String(e.split.groupId) : null,
          paidBy: e.split.paidBy,
          method: e.split.method,
          shares: e.split.shares,
        }
      : null,
    aiMeta: e.aiMeta ? { confidence: e.aiMeta.confidence ?? null, edited: e.aiMeta.edited ?? [], rawInput: e.aiMeta.rawInput ?? "" } : null,
    createdAt: (e as unknown as { createdAt: Date }).createdAt,
  };
}

export type ExpenseDTO = ReturnType<typeof serializeExpense>;

export async function categoryMap(userId: Types.ObjectId) {
  const cats = await Category.find({ userId }).lean<CategoryDoc[]>();
  return new Map(cats.map((c) => [String(c._id), c]));
}

async function assertCategory(userId: Types.ObjectId, categoryId: string) {
  const exists = await Category.exists({ _id: categoryId, userId });
  if (!exists) throw badRequest("Pick one of your categories.", { categoryId: "Unknown category." });
}

type SplitInput = NonNullable<z.infer<typeof expenseSchema>["split"]>;

/** Validates a split against its group and returns the signed-in user's own share. */
async function resolveSplit(userId: Types.ObjectId, amount: number, split: SplitInput) {
  const group = await Group.findOne({ _id: split.groupId, ownerId: userId }).lean<GroupDoc>();
  if (!group) throw badRequest("Pick one of your groups.");
  const memberIds = new Set(group.members.map((m) => String(m._id)));
  for (const s of split.shares) {
    if (!memberIds.has(s.memberId)) throw badRequest("Everyone in a split must be in the group.");
  }
  if (!memberIds.has(split.paidBy)) throw badRequest("Pick who paid from the group.");
  const sum = split.shares.reduce((a, s) => a + s.amount, 0);
  if (Math.abs(sum - amount) > split.shares.length) {
    throw badRequest("Shares must add up to the total amount.", { split: "Shares must add up to the total." });
  }
  // Put any rounding remainder on the payer so totals match exactly.
  const diff = amount - sum;
  const shares = split.shares.map((s) => ({
    memberId: s.memberId,
    name: group.members.find((m) => String(m._id) === s.memberId)?.name ?? s.name ?? "",
    amount: s.memberId === split.paidBy ? s.amount + diff : s.amount,
  }));
  if (diff !== 0 && !shares.some((s) => s.memberId === split.paidBy)) shares[0].amount += diff;
  const me = group.members.find((m) => m.isMe);
  const myShare = me ? (shares.find((s) => s.memberId === String(me._id))?.amount ?? 0) : amount;
  return {
    split: { groupId: group._id, paidBy: split.paidBy, method: split.method, shares },
    myShare,
  };
}

function scheduleBudgetCheck(user: UserDoc, when: Date) {
  after(async () => {
    try {
      await checkBudgetAlerts(user, when);
    } catch (err) {
      console.error("[budget-check]", err);
    }
  });
}

export async function createExpense(user: UserDoc, input: z.infer<typeof expenseSchema>) {
  await assertCategory(user._id, input.categoryId);
  const occurredAt = new Date(input.occurredAt);
  let split = null;
  let myShare = input.amount;
  if (input.split) {
    const r = await resolveSplit(user._id, input.amount, input.split);
    split = r.split;
    myShare = r.myShare;
  }

  const cats = await categoryMap(user._id);
  const chosen = cats.get(input.categoryId);
  const edited: string[] = [];
  if (input.original) {
    if (input.original.amount != null && input.original.amount !== input.amount) edited.push("amount");
    if ((input.original.categoryName ?? "") !== (chosen?.name ?? "")) edited.push("category");
    if ((input.original.merchant ?? "") !== (input.merchant ?? "")) edited.push("merchant");
  }

  const doc = await Expense.create({
    userId: user._id,
    amount: input.amount,
    myShare,
    currency: user.currency,
    categoryId: new Types.ObjectId(input.categoryId),
    merchant: input.merchant ?? "",
    note: input.note ?? "",
    occurredAt,
    paymentMethod: input.paymentMethod ?? null,
    source: input.source,
    receiptId: input.receiptId ? new Types.ObjectId(input.receiptId) : null,
    split,
    aiMeta: input.rawInput || input.confidence ? { rawInput: input.rawInput, parser: "rules-v1", confidence: input.confidence, original: input.original, edited } : undefined,
  });

  if (input.receiptId) {
    await Receipt.updateOne({ _id: input.receiptId, userId: user._id }, { $set: { expenseId: doc._id } });
  }
  // A corrected category on a known merchant teaches the parser for next time.
  if (input.merchant && (input.learnRule || edited.includes("category"))) {
    await learnRule(user._id, input.merchant, new Types.ObjectId(input.categoryId));
  }
  scheduleBudgetCheck(user, occurredAt);
  return serializeExpense(doc.toObject() as ExpenseDoc, cats);
}

export async function updateExpense(user: UserDoc, id: Types.ObjectId, input: z.infer<typeof expenseUpdateSchema>) {
  const existing = await Expense.findOne({ _id: id, userId: user._id }).lean<ExpenseDoc>();
  if (!existing) throw notFound("Expense not found.");
  if (input.categoryId) await assertCategory(user._id, input.categoryId);

  const amount = input.amount ?? existing.amount;
  const set: Record<string, unknown> = {};
  if (input.amount !== undefined) set.amount = input.amount;
  if (input.categoryId) set.categoryId = new Types.ObjectId(input.categoryId);
  if (input.merchant !== undefined) set.merchant = input.merchant;
  if (input.note !== undefined) set.note = input.note;
  if (input.occurredAt) set.occurredAt = new Date(input.occurredAt);
  if (input.paymentMethod !== undefined) set.paymentMethod = input.paymentMethod;

  if (input.split === null) {
    set.split = null;
    set.myShare = amount;
  } else if (input.split) {
    const r = await resolveSplit(user._id, amount, input.split);
    set.split = r.split;
    set.myShare = r.myShare;
  } else if (input.amount !== undefined && !existing.split) {
    set.myShare = amount;
  } else if (input.amount !== undefined && existing.split) {
    throw badRequest("Update the split shares when changing a split amount.");
  }

  const updated = await Expense.findOneAndUpdate({ _id: id, userId: user._id }, { $set: set }, { new: true }).lean<ExpenseDoc>();
  if (!updated) throw notFound("Expense not found.");
  if (input.learnRule && updated.merchant) {
    await learnRule(user._id, updated.merchant, updated.categoryId as Types.ObjectId);
  }
  scheduleBudgetCheck(user, updated.occurredAt);
  return serializeExpense(updated, await categoryMap(user._id));
}

export interface ExpenseFilters {
  month?: string | null;
  from?: string | null;
  to?: string | null;
  categoryIds?: string[];
  sources?: string[];
  q?: string | null;
  min?: number | null;
  max?: number | null;
  groupId?: string | null;
  sort?: "date" | "amount" | "merchant";
  dir?: 1 | -1;
  page?: number;
  limit?: number;
}

export function buildExpenseQuery(user: UserDoc, f: ExpenseFilters) {
  const q: Record<string, unknown> = { userId: user._id };
  if (isMonthKey(f.month)) {
    const r = periodRange(f.month, user);
    q.occurredAt = { $gte: r.start, $lt: r.end };
  } else if (f.from || f.to) {
    const range: Record<string, Date> = {};
    if (f.from) range.$gte = new Date(f.from);
    if (f.to) range.$lt = new Date(f.to);
    q.occurredAt = range;
  }
  const catIds = (f.categoryIds ?? []).filter((c) => Types.ObjectId.isValid(c));
  if (catIds.length) q.categoryId = { $in: catIds.map((c) => new Types.ObjectId(c)) };
  if (f.sources?.length) q.source = { $in: f.sources };
  if (f.groupId && Types.ObjectId.isValid(f.groupId)) q["split.groupId"] = new Types.ObjectId(f.groupId);
  if (f.min != null || f.max != null) {
    const amt: Record<string, number> = {};
    if (f.min != null) amt.$gte = f.min;
    if (f.max != null) amt.$lte = f.max;
    q.amount = amt;
  }
  if (f.q) {
    const term = f.q.trim();
    const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const asNumber = Number(term.replace(/[₹,\s]/g, ""));
    const or: Record<string, unknown>[] = [{ merchant: re }, { note: re }];
    if (Number.isFinite(asNumber) && asNumber > 0) or.push({ amount: Math.round(asNumber * 100) });
    q.$or = or;
  }
  return q;
}

export async function listExpenses(user: UserDoc, f: ExpenseFilters) {
  const query = buildExpenseQuery(user, f);
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 500);
  const page = Math.max(f.page ?? 1, 1);
  const sortField = f.sort === "amount" ? "amount" : f.sort === "merchant" ? "merchant" : "occurredAt";
  const [items, totals, cats] = await Promise.all([
    Expense.find(query)
      .sort({ [sortField]: f.dir ?? -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<ExpenseDoc[]>(),
    Expense.aggregate<{ count: number; sum: number }>([
      { $match: query },
      { $group: { _id: null, count: { $sum: 1 }, sum: { $sum: "$myShare" } } },
    ]),
    categoryMap(user._id),
  ]);
  return {
    items: items.map((e) => serializeExpense(e, cats)),
    total: totals[0]?.count ?? 0,
    sum: totals[0]?.sum ?? 0,
    page,
    limit,
  };
}

/**
 * Text and voice entries: warn when the same amount and category was logged in the last
 * 10 minutes for about the same time (a likely double entry, not a repeat purchase).
 */
export async function findRecentSimilar(userId: Types.ObjectId, amount: number | null, categoryId: string | null, when: Date = new Date()) {
  if (!amount) return null;
  const since = new Date(Date.now() - 10 * 60_000);
  const q: Record<string, unknown> = {
    userId,
    amount,
    createdAt: { $gte: since },
    occurredAt: { $gte: new Date(when.getTime() - 12 * 3600_000), $lte: new Date(when.getTime() + 12 * 3600_000) },
  };
  if (categoryId) q.categoryId = new Types.ObjectId(categoryId);
  return Expense.findOne(q).sort({ createdAt: -1 }).lean<ExpenseDoc>();
}

/** Receipts: same merchant and amount within a day either side. */
export async function findSimilarReceiptExpense(userId: Types.ObjectId, amount: number | null, merchant: string | null, when: Date | null) {
  if (!amount) return null;
  const at = when ?? new Date();
  const q: Record<string, unknown> = {
    userId,
    amount,
    occurredAt: { $gte: new Date(at.getTime() - 36 * 3600_000), $lte: new Date(at.getTime() + 36 * 3600_000) },
  };
  if (merchant) q.merchant = new RegExp(`^${merchant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  return Expense.findOne(q).lean<ExpenseDoc>();
}
