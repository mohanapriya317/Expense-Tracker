import { Types } from "mongoose";
import { after } from "next/server";
import { bulkSchema } from "@/lib/schemas";
import { requireUser } from "@/server/auth";
import { badRequest, readJson, route } from "@/server/http";
import { Category, Expense } from "@/server/models";
import { checkBudgetAlerts } from "@/server/services/budgets";

/** Bulk delete or re-categorise selected expenses. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await readJson(req, bulkSchema);
  const ids = input.ids.map((id) => new Types.ObjectId(id));
  const filter = { userId: user._id, _id: { $in: ids } };
  let affected = 0;
  if (input.action === "delete") {
    affected = (await Expense.deleteMany(filter)).deletedCount;
  } else {
    if (!input.categoryId || !(await Category.exists({ _id: input.categoryId, userId: user._id }))) throw badRequest("Pick one of your categories.");
    affected = (await Expense.updateMany(filter, { $set: { categoryId: new Types.ObjectId(input.categoryId) } })).modifiedCount;
  }
  after(() => checkBudgetAlerts(user, new Date()).catch(() => undefined));
  return Response.json({ ok: true, affected });
});
