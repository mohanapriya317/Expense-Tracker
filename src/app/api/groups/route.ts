import { groupSchema } from "@/lib/schemas";
import { requireUser } from "@/server/auth";
import { readJson, route } from "@/server/http";
import { Group, type GroupDoc } from "@/server/models";
import { listGroups, serializeGroup } from "@/server/services/groups";

export const GET = route(async () => {
  const user = await requireUser();
  return Response.json({ groups: await listGroups(user._id) });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await readJson(req, groupSchema);
  const others = input.members.filter((m) => m.name.toLowerCase() !== "you");
  const group = await Group.create({
    ownerId: user._id,
    name: input.name,
    currency: user.currency,
    members: [{ name: "You", email: user.email, isMe: true }, ...others.map((m) => ({ name: m.name, email: m.email ?? "" }))],
  });
  return Response.json({ group: serializeGroup(group.toObject() as GroupDoc, []) }, { status: 201 });
});
