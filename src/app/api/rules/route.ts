import { z } from "zod";
import { Types } from "mongoose";
import { requireUser } from "@/server/auth";
import { badRequest, readJson, route } from "@/server/http";
import { Category, CategoryRule } from "@/server/models";
import { learnRule } from "@/server/services/categories";

export const GET = route(async () => {
  const user = await requireUser();
  const [rules, cats] = await Promise.all([CategoryRule.find({ userId: user._id }).sort({ hits: -1, match: 1 }).lean(), Category.find({ userId: user._id }).lean()]);
  const name = new Map(cats.map((c) => [String(c._id), c.name]));
  return Response.json({
    rules: rules.map((r) => ({ id: String(r._id), match: r.match, categoryId: String(r.categoryId), categoryName: name.get(String(r.categoryId)) ?? "", hits: r.hits })),
  });
});

const schema = z.object({ match: z.string().trim().min(2).max(60), categoryId: z.string() });

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await readJson(req, schema);
  if (!Types.ObjectId.isValid(input.categoryId) || !(await Category.exists({ _id: input.categoryId, userId: user._id }))) {
    throw badRequest("Pick one of your categories.");
  }
  await learnRule(user._id, input.match, new Types.ObjectId(input.categoryId));
  return Response.json({ ok: true }, { status: 201 });
});
