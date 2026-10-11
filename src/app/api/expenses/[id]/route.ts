import { after } from "next/server";
import { expenseUpdateSchema } from "@/lib/schemas";
import { requireUser } from "@/server/auth";
import { notFound, oid, readJson, route } from "@/server/http";
import { Expense, Group, Receipt, type ExpenseDoc, type GroupDoc, type ReceiptDoc } from "@/server/models";
import { checkBudgetAlerts } from "@/server/services/budgets";
import { categoryMap, serializeExpense, updateExpense } from "@/server/services/expenses";

type Ctx = RouteContext<"/api/expenses/[id]">;

export const GET = route<Ctx>(async (_req, ctx) => {
  const user = await requireUser();
  const id = oid((await ctx.params).id, "Expense not found.");
  const e = await Expense.findOne({ _id: id, userId: user._id }).lean<ExpenseDoc>();
  if (!e) throw notFound("Expense not found.");
  const [cats, receipt, group] = await Promise.all([
    categoryMap(user._id),
    e.receiptId ? Receipt.findOne({ _id: e.receiptId, userId: user._id }).select({ ocrText: 1, status: 1, mimeType: 1 }).lean<ReceiptDoc>() : null,
    e.split?.groupId ? Group.findOne({ _id: e.split.groupId, ownerId: user._id }).lean<GroupDoc>() : null,
  ]);
  return Response.json({
    expense: serializeExpense(e, cats),
    receipt: receipt ? { id: String(receipt._id), status: receipt.status, mimeType: receipt.mimeType, ocrText: receipt.ocrText } : null,
    group: group ? { id: String(group._id), name: group.name, members: group.members.map((m) => ({ id: String(m._id), name: m.name, isMe: m.isMe })) } : null,
  });
});

export const PATCH = route<Ctx>(async (req, ctx) => {
  const user = await requireUser();
  const id = oid((await ctx.params).id, "Expense not found.");
  const input = await readJson(req, expenseUpdateSchema);
  const expense = await updateExpense(user, id, input);
  return Response.json({ expense });
});

/** Deletes an expense. The client keeps the returned copy so "Undo" can recreate it. */
export const DELETE = route<Ctx>(async (_req, ctx) => {
  const user = await requireUser();
  const id = oid((await ctx.params).id, "Expense not found.");
  const e = await Expense.findOneAndDelete({ _id: id, userId: user._id }).lean<ExpenseDoc>();
  if (!e) throw notFound("Expense not found.");
  if (e.receiptId) await Receipt.updateOne({ _id: e.receiptId }, { $set: { expenseId: null } });
  after(() => checkBudgetAlerts(user, e.occurredAt).catch(() => undefined));
  return Response.json({ ok: true });
});
