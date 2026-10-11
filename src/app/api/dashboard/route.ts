import { isMonthKey } from "@/lib/period";
import { requireUser } from "@/server/auth";
import { route, searchParams } from "@/server/http";
import { getDashboard } from "@/server/services/analytics";

export const GET = route(async (req) => {
  const user = await requireUser();
  const m = searchParams(req).get("month");
  return Response.json(await getDashboard(user, isMonthKey(m) ? m : undefined));
});
