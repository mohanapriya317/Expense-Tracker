import "server-only";
import type { Types } from "mongoose";
import { Expense, Group, type ExpenseDoc, type GroupDoc } from "../models";

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

/**
 * Net balance per member: positive = others owe them, negative = they owe.
 * Each split expense credits the payer the full amount and debits each share.
 */
export function computeBalances(group: GroupDoc, expenses: ExpenseDoc[]) {
  const net = new Map<string, number>(group.members.map((m) => [String(m._id), 0]));
  for (const e of expenses) {
    if (!e.split) continue;
    net.set(e.split.paidBy, (net.get(e.split.paidBy) ?? 0) + e.amount);
    for (const s of e.split.shares) net.set(s.memberId, (net.get(s.memberId) ?? 0) - s.amount);
  }
  for (const s of group.settlements) {
    net.set(s.from, (net.get(s.from) ?? 0) + s.amount);
    net.set(s.to, (net.get(s.to) ?? 0) - s.amount);
  }
  return net;
}

/** Fewest transfers that settle everyone (greedy largest debtor to largest creditor). */
export function simplifyDebts(net: Map<string, number>): Transfer[] {
  const debtors = [...net.entries()].filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  const creditors = [...net.entries()].filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  debtors.sort((a, b) => b.v - a.v);
  creditors.sort((a, b) => b.v - a.v);
  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].v, creditors[j].v);
    if (amt > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amount: amt });
    debtors[i].v -= amt;
    creditors[j].v -= amt;
    if (debtors[i].v === 0) i++;
    if (creditors[j].v === 0) j++;
  }
  return out;
}

export async function groupExpenses(groupId: Types.ObjectId, ownerId: Types.ObjectId) {
  return Expense.find({ userId: ownerId, "split.groupId": groupId }).sort({ occurredAt: -1 }).lean<ExpenseDoc[]>();
}

export function serializeGroup(group: GroupDoc, expenses: ExpenseDoc[]) {
  const net = computeBalances(group, expenses);
  const me = group.members.find((m) => m.isMe);
  const name = (id: string) => group.members.find((m) => String(m._id) === id)?.name ?? "Someone";
  return {
    id: String(group._id),
    name: group.name,
    currency: group.currency,
    members: group.members.map((m) => ({ id: String(m._id), name: m.name, email: m.email, isMe: m.isMe, balance: net.get(String(m._id)) ?? 0 })),
    myBalance: me ? (net.get(String(me._id)) ?? 0) : 0,
    totalSpent: expenses.reduce((s, e) => s + e.amount, 0),
    expenseCount: expenses.length,
    transfers: simplifyDebts(net).map((t) => ({ ...t, fromName: name(t.from), toName: name(t.to) })),
    settlements: [...group.settlements]
      .sort((a, b) => +new Date(b.date) - +new Date(a.date))
      .map((s) => ({ id: String((s as unknown as { _id: Types.ObjectId })._id), from: s.from, to: s.to, fromName: name(s.from), toName: name(s.to), amount: s.amount, date: s.date, note: s.note })),
  };
}

export async function listGroups(ownerId: Types.ObjectId) {
  const groups = await Group.find({ ownerId }).sort({ updatedAt: -1 }).lean<GroupDoc[]>();
  const expenses = await Expense.find({ userId: ownerId, "split.groupId": { $in: groups.map((g) => g._id) } }).lean<ExpenseDoc[]>();
  return groups.map((g) => serializeGroup(g, expenses.filter((e) => String(e.split?.groupId) === String(g._id))));
}
