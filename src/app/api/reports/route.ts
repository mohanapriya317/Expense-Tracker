import { currentMonthKey, isMonthKey } from "@/lib/period";
import { requireUser } from "@/server/auth";
import { route, searchParams } from "@/server/http";
import { getMonthReport } from "@/server/services/analytics";

export const GET = route(async (req) => {
  const user = await requireUser();
  const m = searchParams(req).get("month");
  const report = await getMonthReport(user, isMonthKey(m) ? m : currentMonthKey(user));
  // The page shows the latest 20; exports include every transaction.
  return Response.json({ ...report, transactions: report.transactions.slice(-20).reverse() });
});
