import "server-only";
import type { Types } from "mongoose";
import { DEFAULT_CATEGORIES } from "@/lib/categories";
import type { ParseContext } from "@/lib/parser";
import { Category, CategoryRule, type CategoryDoc } from "../models";

export function serializeCategory(c: CategoryDoc) {
  return {
    id: String(c._id),
    name: c.name,
    icon: c.icon,
    color: c.color,
    keywords: c.keywords ?? [],
    isDefault: c.isDefault,
    archived: c.archived,
  };
}

export type CategoryDTO = ReturnType<typeof serializeCategory>;

export async function ensureDefaultCategories(userId: Types.ObjectId, onlyKeys?: string[]) {
  const existing = await Category.countDocuments({ userId });
  if (existing > 0) return;
  const defs = onlyKeys?.length ? DEFAULT_CATEGORIES.filter((d) => onlyKeys.includes(d.key) || d.key === "other") : DEFAULT_CATEGORIES;
  await Category.insertMany(
    defs.map((d) => ({ userId, name: d.name, icon: d.icon, color: d.color, isDefault: true, keywords: [] })),
    { ordered: false },
  ).catch(() => undefined);
}

export async function listCategories(userId: Types.ObjectId, includeArchived = false) {
  const filter: Record<string, unknown> = { userId };
  if (!includeArchived) filter.archived = false;
  const docs = await Category.find(filter).sort({ isDefault: -1, name: 1 }).lean<CategoryDoc[]>();
  return docs;
}

/** Everything the parser needs to use this user's categories and learned rules. */
export async function parseContextFor(userId: Types.ObjectId) {
  const [cats, rules] = await Promise.all([
    Category.find({ userId, archived: false }).lean<CategoryDoc[]>(),
    CategoryRule.find({ userId }).lean(),
  ]);
  const byId = new Map(cats.map((c) => [String(c._id), c]));
  const byName = new Map(cats.map((c) => [c.name.toLowerCase(), c]));
  const ctx: ParseContext = {
    categories: cats.map((c) => ({ name: c.name, keywords: c.keywords ?? [] })),
    rules: rules
      .map((r) => ({ match: r.match, categoryName: byId.get(String(r.categoryId))?.name ?? "" }))
      .filter((r) => r.categoryName),
  };
  const other = byName.get("other") ?? cats[0];
  return { ctx, byId, byName, other };
}

export async function learnRule(userId: Types.ObjectId, match: string, categoryId: Types.ObjectId) {
  const key = match.trim().toLowerCase();
  if (key.length < 2) return;
  await CategoryRule.updateOne({ userId, match: key }, { $set: { categoryId }, $inc: { hits: 1 } }, { upsert: true });
}
