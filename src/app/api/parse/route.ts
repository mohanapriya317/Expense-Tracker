import { parseExpenseText } from "@/lib/parser";
import { parseSchema } from "@/lib/schemas";
import { requireUser } from "@/server/auth";
import { rateLimit, readJson, route } from "@/server/http";
import { parseContextFor } from "@/server/services/categories";
import { categoryMap, findRecentSimilar, serializeExpense } from "@/server/services/expenses";

/** Text and voice capture: extract amount, category, merchant and date, then check for a recent repeat. */
export const POST = route(async (req) => {
  const user = await requireUser();
  rateLimit(`parse:${user._id}`, 120);
  const { text } = await readJson(req, parseSchema);
  const { ctx, byName, other } = await parseContextFor(user._id);
  const parsed = parseExpenseText(text, ctx);
  const cat = (parsed.categoryName && byName.get(parsed.categoryName.toLowerCase())) || other;
  if (!parsed.categoryName || !byName.has(parsed.categoryName.toLowerCase())) parsed.confidence.category = "low";
  const dup = await findRecentSimilar(user._id, parsed.amount, cat ? String(cat._id) : null, parsed.occurredAt ? new Date(parsed.occurredAt) : new Date());
  return Response.json({
    parsed,
    categoryId: cat ? String(cat._id) : null,
    duplicate: dup ? serializeExpense(dup, await categoryMap(user._id)) : null,
  });
});
