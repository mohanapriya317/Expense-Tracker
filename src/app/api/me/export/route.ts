import { publicUser, requireUser } from "@/server/auth";
import { route, searchParams } from "@/server/http";
import { Budget, Category, CategoryRule, Expense, Group, type CategoryDoc, type ExpenseDoc } from "@/server/models";

function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Download all of the user's data as JSON, or their expenses as CSV. */
export const GET = route(async (req) => {
  const user = await requireUser();
  const format = searchParams(req).get("format") === "csv" ? "csv" : "json";
  const [expenses, categories] = await Promise.all([
    Expense.find({ userId: user._id }).sort({ occurredAt: -1 }).lean<ExpenseDoc[]>(),
    Category.find({ userId: user._id }).lean<CategoryDoc[]>(),
  ]);
  const catName = new Map(categories.map((c) => [String(c._id), c.name]));
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    const header = ["date", "amount", "your_share", "currency", "category", "merchant", "note", "payment_method", "source"];
    const rows = expenses.map((e) =>
      [new Date(e.occurredAt).toISOString(), e.amount / 100, e.myShare / 100, e.currency, catName.get(String(e.categoryId)) ?? "", e.merchant, e.note, e.paymentMethod ?? "", e.source]
        .map(csvCell)
        .join(","),
    );
    return new Response([header.join(","), ...rows].join("\n"), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="expenses-${stamp}.csv"` },
    });
  }

  const [budgets, rules, groups] = await Promise.all([
    Budget.find({ userId: user._id }).lean(),
    CategoryRule.find({ userId: user._id }).lean(),
    Group.find({ ownerId: user._id }).lean(),
  ]);
  const body = JSON.stringify({ exportedAt: new Date(), user: publicUser(user), categories, expenses, budgets, rules, groups }, null, 2);
  return new Response(body, {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="expense-tracker-${stamp}.json"` },
  });
});
