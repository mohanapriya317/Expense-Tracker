import { currentMonthKey, isMonthKey } from "@/lib/period";
import { requireUser } from "@/server/auth";
import { route, searchParams } from "@/server/http";
import { getMonthReport } from "@/server/services/analytics";
import { reportPdf, reportXlsx } from "@/server/services/exports";

export const maxDuration = 30;

/** Downloadable monthly report: ?month=2026-10&format=pdf|xlsx */
export const GET = route(async (req) => {
  const user = await requireUser();
  const p = searchParams(req);
  const m = p.get("month");
  const key = isMonthKey(m) ? m : currentMonthKey(user);
  const report = await getMonthReport(user, key);
  if (p.get("format") === "xlsx") {
    const buf = await reportXlsx(report, user.currency);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="expenses-${key}.xlsx"`,
      },
    });
  }
  const buf = await reportPdf(report, user.currency, user.name);
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="expenses-${key}.pdf"` },
  });
});
