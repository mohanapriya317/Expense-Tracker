"use client";

import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, FileText, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { CompareBars } from "@/components/charts";
import { ExpenseRow } from "@/components/expense-row";
import { MonthSwitcher, useCurrentMonthKey } from "@/components/month-switcher";
import { Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, buttonClass, cn } from "@/components/ui";
import { api } from "@/lib/api";
import { useMoney } from "@/lib/hooks";
import type { Report } from "@/lib/types";

export default function ReportsPage() {
  const current = useCurrentMonthKey();
  const [month, setMonth] = useState<string | null>(null);
  const key = month ?? current;
  const money = useMoney();
  const q = useQuery({ queryKey: ["reports", key], queryFn: () => api.get<Report>(`/api/reports?month=${key}`) });
  const r = q.data;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <PageHeader
        title="Reports"
        subtitle={r ? `${r.label} compared with ${r.prevLabel}` : " "}
        actions={
          <>
            <MonthSwitcher value={key} onChange={setMonth} />
            <a href={`/api/reports/export?month=${key}&format=pdf`} className={buttonClass("secondary", "sm")} download>
              <FileText className="size-4" /> PDF
            </a>
            <a href={`/api/reports/export?month=${key}&format=xlsx`} className={buttonClass("secondary", "sm")} download>
              <FileSpreadsheet className="size-4" /> Excel
            </a>
          </>
        }
      />

      {q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : !r ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-80" />
        </div>
      ) : r.count === 0 && r.prevTotal === 0 ? (
        <Card>
          <EmptyState title={`Nothing to report for ${r.label}`} body="Add expenses and they'll be summarised here, with downloadable PDF and Excel reports." />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label={`Spent in ${r.label}`} value={money(r.total)} />
            <Stat label={`Spent in ${r.prevLabel}`} value={money(r.prevTotal)} />
            <Stat
              label="Change"
              value={r.changePct == null ? "—" : `${r.changePct > 0 ? "+" : ""}${r.changePct}%`}
              tone={r.changePct == null ? undefined : r.changePct > 0 ? "danger" : "success"}
              icon={r.changePct == null ? undefined : r.changePct > 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
            />
            <Stat label="Per day" value={money(r.avgPerDay)} sub={`${r.count} expenses`} />
          </div>

          <Card className="flex flex-col gap-3 p-5">
            <CardHeader title="By category" subtitle={`${r.label} vs ${r.prevLabel}`} />
            <div className="flex gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-primary" /> {r.label}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-line" /> {r.prevLabel}
              </span>
            </div>
            <CompareBars data={r.categories.slice(0, 10)} height={Math.max(160, Math.min(r.categories.length, 10) * 40)} currentLabel={r.label} previousLabel={r.prevLabel} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="py-2 font-semibold">Category</th>
                    <th className="py-2 text-right font-semibold">{r.label}</th>
                    <th className="py-2 text-right font-semibold">{r.prevLabel}</th>
                    <th className="py-2 text-right font-semibold">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {r.categories.map((c) => (
                    <tr key={c.categoryId} className="border-b border-line last:border-0">
                      <td className="py-2.5">
                        <span className="flex items-center gap-2">
                          <span className="size-2.5 rounded-sm" style={{ background: c.color }} />
                          {c.name}
                        </span>
                      </td>
                      <td className="tabular py-2.5 text-right font-semibold">{money(c.current)}</td>
                      <td className="tabular py-2.5 text-right text-muted">{money(c.previous)}</td>
                      <td className={cn("tabular py-2.5 text-right font-medium", c.change > 0 ? "text-danger" : c.change < 0 ? "text-success" : "text-muted")}>
                        {c.changePct == null ? "new" : `${c.changePct > 0 ? "+" : ""}${c.changePct}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="flex flex-col gap-3 p-5">
              <CardHeader title="Biggest changes" />
              <ul className="flex flex-col gap-3">
                {r.biggestChanges.map((c) => (
                  <li key={c.categoryId} className="flex items-center justify-between text-sm">
                    <span>{c.name}</span>
                    <span className={cn("tabular font-semibold", c.change > 0 ? "text-danger" : "text-success")}>
                      {c.change > 0 ? "+" : "−"}
                      {money(Math.abs(c.change))}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="flex flex-col gap-3 p-5">
              <CardHeader title="Top merchants" />
              {r.topMerchants.length ? (
                <ul className="flex flex-col gap-3">
                  {r.topMerchants.map((m) => (
                    <li key={m.name} className="flex items-center justify-between text-sm">
                      <span>{m.name}</span>
                      <span className="tabular font-semibold">{money(m.total)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">No merchants recorded.</p>
              )}
            </Card>
          </div>

          {r.transactions.length > 0 && (
            <Card className="overflow-hidden">
              <div className="px-5 pt-4">
                <h2 className="text-[17px] font-semibold">Latest transactions</h2>
                <p className="text-[13px] text-muted">The PDF and Excel downloads include every transaction.</p>
              </div>
              <div className="mt-2 divide-y divide-line border-t border-line">
                {r.transactions.map((e) => (
                  <ExpenseRow key={e.id} e={e} showDate href={`/activity/${e.id}`} />
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone, icon }: { label: string; value: string; sub?: string; tone?: "danger" | "success"; icon?: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-[13px] text-muted">{label}</span>
      <span className={cn("tabular flex items-center gap-1 text-xl font-bold", tone === "danger" && "text-danger", tone === "success" && "text-success")}>
        {icon}
        {value}
      </span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </Card>
  );
}
