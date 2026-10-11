import { categorySchema } from "@/lib/schemas";
import { requireUser } from "@/server/auth";
import { badRequest, notFound, oid, readJson, route } from "@/server/http";
import { Budget, Category, CategoryRule, Expense, type CategoryDoc } from "@/server/models";
import { serializeCategory } from "@/server/services/categories";

type Ctx = RouteContext<"/api/categories/[id]">;

export const PATCH = route<Ctx>(async (req, ctx) => {
  const user = await requireUser();
  const id = oid((await ctx.params).id, "Category not found.");
  const input = await readJson(req, categorySchema.partial());
  const doc = await Category.findOneAndUpdate({ _id: id, userId: user._id }, { $set: input }, { new: true }).lean<CategoryDoc>();
  if (!doc) throw notFound("Category not found.");
  return Response.json({ category: serializeCategory(doc) });
});

/** Deleting moves its expenses (and rules) to "Other" so no spending disappears. */
export const DELETE = route<Ctx>(async (_req, ctx) => {
  const user = await requireUser();
  const id = oid((await ctx.params).id, "Category not found.");
  const cat = await Category.findOne({ _id: id, userId: user._id }).lean<CategoryDoc>();
  if (!cat) throw notFound("Category not found.");
  if (cat.name.toLowerCase() === "other") throw badRequest("The Other category can't be deleted.");
  let other = await Category.findOne({ userId: user._id, name: "Other" }).lean<CategoryDoc>();
  if (!other) other = (await Category.create({ userId: user._id, name: "Other", icon: "circle-ellipsis", color: "#94A3B8", isDefault: true })).toObject() as CategoryDoc;
  const moved = await Expense.updateMany({ userId: user._id, categoryId: id }, { $set: { categoryId: other._id } });
  await Promise.all([
    CategoryRule.deleteMany({ userId: user._id, categoryId: id }),
    Budget.deleteMany({ userId: user._id, categoryId: id }),
    Category.deleteOne({ _id: id, userId: user._id }),
  ]);
  return Response.json({ ok: true, movedExpenses: moved.modifiedCount });
});
