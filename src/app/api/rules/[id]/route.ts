import { requireUser } from "@/server/auth";
import { oid, route } from "@/server/http";
import { CategoryRule } from "@/server/models";

export const DELETE = route<RouteContext<"/api/rules/[id]">>(async (_req, ctx) => {
  const user = await requireUser();
  const id = oid((await ctx.params).id, "Rule not found.");
  await CategoryRule.deleteOne({ _id: id, userId: user._id });
  return Response.json({ ok: true });
});
