import { z } from "zod";
import { requireUser } from "@/server/auth";
import { badRequest, notFound, oid, readJson, route } from "@/server/http";
import { Expense, Group, type GroupDoc } from "@/server/models";
import { categoryMap, serializeExpense } from "@/server/services/expenses";
import { groupExpenses, serializeGroup } from "@/server/services/groups";

type Ctx = RouteContext<"/api/groups/[id]">;

async function load(ctx: Ctx) {
  const user = await requireUser();
  const id = oid((await ctx.params).id, "Group not found.");
  const group = await Group.findOne({ _id: id, ownerId: user._id }).lean<GroupDoc>();
  if (!group) throw notFound("Group not found.");
  return { user, group };
}

export const GET = route<Ctx>(async (_req, ctx) => {
  const { user, group } = await load(ctx);
  const [expenses, cats] = await Promise.all([groupExpenses(group._id, user._id), categoryMap(user._id)]);
  return Response.json({ group: serializeGroup(group, expenses), expenses: expenses.map((e) => serializeExpense(e, cats)) });
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  addMembers: z.array(z.object({ name: z.string().trim().min(1).max(60), email: z.string().trim().email().or(z.literal("")).optional() })).max(20).optional(),
  removeMemberId: z.string().optional(),
});

export const PATCH = route<Ctx>(async (req, ctx) => {
  const { user, group } = await load(ctx);
  const input = await readJson(req, patchSchema);
  if (input.name) await Group.updateOne({ _id: group._id }, { $set: { name: input.name } });
  if (input.addMembers?.length) {
    await Group.updateOne({ _id: group._id }, { $push: { members: { $each: input.addMembers.map((m) => ({ name: m.name, email: m.email ?? "" })) } } });
  }
  if (input.removeMemberId) {
    const member = group.members.find((m) => String(m._id) === input.removeMemberId);
    if (!member) throw notFound("Member not found.");
    if (member.isMe) throw badRequest("You can't remove yourself.");
    const used = await Expense.exists({ userId: user._id, "split.groupId": group._id, $or: [{ "split.paidBy": input.removeMemberId }, { "split.shares.memberId": input.removeMemberId }] });
    if (used) throw badRequest(`${member.name} is part of shared expenses. Settle and remove those first.`);
    await Group.updateOne({ _id: group._id }, { $pull: { members: { _id: member._id } } });
  }
  const fresh = await Group.findById(group._id).lean<GroupDoc>();
  return Response.json({ group: serializeGroup(fresh!, await groupExpenses(group._id, user._id)) });
});

/** Deleting a group keeps its expenses as personal ones (your share stays). */
export const DELETE = route<Ctx>(async (_req, ctx) => {
  const { user, group } = await load(ctx);
  await Expense.updateMany({ userId: user._id, "split.groupId": group._id }, { $set: { split: null } });
  await Group.deleteOne({ _id: group._id });
  return Response.json({ ok: true });
});
