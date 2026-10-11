import { expenseSchema } from "@/lib/schemas";
import { requireUser } from "@/server/auth";
import { readJson, route, searchParams } from "@/server/http";
import { createExpense, listExpenses } from "@/server/services/expenses";

function num(v: string | null) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export const GET = route(async (req) => {
  const user = await requireUser();
  const p = searchParams(req);
  const sort = p.get("sort");
  const result = await listExpenses(user, {
    month: p.get("month"),
    from: p.get("from"),
    to: p.get("to"),
    categoryIds: p.getAll("category").flatMap((c) => c.split(",")).filter(Boolean),
    sources: p.getAll("source").flatMap((c) => c.split(",")).filter(Boolean),
    q: p.get("q"),
    min: num(p.get("min")),
    max: num(p.get("max")),
    groupId: p.get("group"),
    sort: sort === "amount" || sort === "merchant" ? sort : "date",
    dir: p.get("dir") === "asc" ? 1 : -1,
    page: Number(p.get("page") ?? 1) || 1,
    limit: Number(p.get("limit") ?? 50) || 50,
  });
  return Response.json(result);
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await readJson(req, expenseSchema);
  const expense = await createExpense(user, input);
  return Response.json({ expense }, { status: 201 });
});
