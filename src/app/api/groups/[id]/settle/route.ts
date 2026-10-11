import { settleSchema } from "@/lib/schemas";
import { requireUser } from "@/server/auth";
import { badRequest, notFound, oid, readJson, route } from "@/server/http";
import { Group, type GroupDoc } from "@/server/models";
import { groupExpenses, serializeGroup } from "@/server/services/groups";

/** Record a payment between two members ("Ravi paid you ₹500"). */
export const POST = route<RouteContext<"/api/groups/[id]/settle">>(async (req, ctx) => {
  const user = await requireUser();
  const id = oid((await ctx.params).id, "Group not found.");
  const input = await readJson(req, settleSchema);
  const group = await Group.findOne({ _id: id, ownerId: user._id }).lean<GroupDoc>();
  if (!group) throw notFound("Group not found.");
  const ids = new Set(group.members.map((m) => String(m._id)));
  if (!ids.has(input.from) || !ids.has(input.to) || input.from === input.to) throw badRequest("Pick two different members.");
  await Group.updateOne({ _id: id }, { $push: { settlements: { from: input.from, to: input.to, amount: input.amount, note: input.note ?? "", date: new Date() } } });
  const fresh = await Group.findById(id).lean<GroupDoc>();
  return Response.json({ group: serializeGroup(fresh!, await groupExpenses(id, user._id)) });
});
