import { categorySchema } from "@/lib/schemas";
import { requireUser } from "@/server/auth";
import { readJson, route, searchParams } from "@/server/http";
import { Category, Expense, type CategoryDoc } from "@/server/models";
import { ensureDefaultCategories, listCategories, serializeCategory } from "@/server/services/categories";

export const GET = route(async (req) => {
  const user = await requireUser();
  await ensureDefaultCategories(user._id);
  const includeArchived = searchParams(req).get("all") === "1";
  const [cats, counts] = await Promise.all([
    listCategories(user._id, includeArchived),
    Expense.aggregate<{ _id: string; count: number }>([{ $match: { userId: user._id } }, { $group: { _id: "$categoryId", count: { $sum: 1 } } }]),
  ]);
  const countBy = new Map(counts.map((c) => [String(c._id), c.count]));
  return Response.json({ categories: cats.map((c) => ({ ...serializeCategory(c), expenseCount: countBy.get(String(c._id)) ?? 0 })) });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await readJson(req, categorySchema);
  const doc = await Category.create({ userId: user._id, ...input, isDefault: false });
  return Response.json({ category: serializeCategory(doc.toObject() as CategoryDoc) }, { status: 201 });
});
