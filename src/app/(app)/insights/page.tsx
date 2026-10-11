"use client";

import { useQuery } from "@tanstack/react-query";
import { Lightbulb } from "lucide-react";
import { SimpleBars } from "@/components/charts";
import { Card, CardHeader, ErrorState, PageHeader, Progress, Skeleton, cn } from "@/components/ui";
import { api } from "@/lib/api";
import { useMoney } from "@/lib/hooks";
import type { Insights } from "@/lib/types";

export default function InsightsPage() {
  const money = useMoney();
  const q = useQuery({ queryKey: ["insights"], queryFn: () => api.get<Insights>("/api/insights") });
  const d = q.data;
  const ringColor = !d ? "var(--line)" : d.score >= 65 ? "var(--success)" : d.score >= 45 ? "var(--warning)" : "var(--danger)";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <PageHeader title="Insights" subtitle="Your financial health and where this month is heading." />
      {q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : !d ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-[320px_1fr]">
            <Card className="flex flex-col items-center gap-3 p-6 text-center">
              <div
                className="flex size-36 items-center justify-center rounded-full"
                style={{ background: `conic-gradient(${ringColor} ${d.score * 3.6}deg, var(--surface-muted) 0deg)` }}
                role="img"
                aria-label={`Financial health score ${d.score} out of 100, ${d.label}`}
              >
                <div className="flex size-28 flex-col items-center justify-center rounded-full bg-surface">
                  <span className="text-4xl font-bold">{d.score}</span>
                  <span className="text-xs text-muted">out of 100</span>
                </div>
              </div>
              <p className="text-lg font-semibold">{d.label}</p>
              <p className="text-sm text-muted">Based on your budgets, spending trend, wants vs needs, and how regularly you log.</p>
            </Card>
            <Card className="flex flex-col gap-4 p-5">
              <CardHeader title="What makes up your score" />
              <ul className="flex flex-col gap-4">
                {d.factors.map((f) => (
                  <li key={f.name} className="flex flex-col gap-1.5">
                    <span className="flex justify-between text-sm">
                      <span className="font-medium">{f.name}</span>
                      <span className="tabular text-muted">
                        {f.points} / {f.max}
                      </span>
                    </span>
                    <Progress value={(f.points / f.max) * 100} tone={f.points / f.max >= 0.7 ? "success" : f.points / f.max >= 0.4 ? "warning" : "danger"} label={f.name} />
                    <span className="text-[13px] text-muted">{f.detail}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card className="flex flex-col gap-3 p-5">
            <CardHeader title="Suggestions" />
            <ul className="flex flex-col gap-2.5">
              {d.tips.map((t) => (
                <li key={t} className="flex gap-3 rounded-xl bg-primary-soft p-3 text-sm text-primary-ink">
                  <Lightbulb className="mt-0.5 size-4 shrink-0" /> {t}
                </li>
              ))}
            </ul>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="flex flex-col gap-3 p-5">
              <CardHeader title="Forecast for this month" subtitle="Variable spending continues at this month's pace; rent and bills stay fixed." />
              <div className="grid grid-cols-3 gap-2 text-center">
                <Mini label="Spent so far" value={money(d.forecast.spent)} />
                <Mini label="Likely total" value={money(d.forecast.projected)} tone={d.forecast.budget && d.forecast.projected > d.forecast.budget ? "danger" : undefined} />
                <Mini label="Budget" value={d.forecast.budget ? money(d.forecast.budget) : "—"} />
              </div>
              <ul className="flex flex-col gap-3 pt-2">
                {d.forecast.categories.map((c) => {
                  const scale = Math.max(c.projected, c.limit ?? 0, 1);
                  return (
                    <li key={c.name} className="flex flex-col gap-1">
                      <span className="flex justify-between text-[13px]">
                        <span>{c.name}</span>
                        <span className={cn("tabular", c.limit && c.projected > c.limit ? "font-semibold text-danger" : "text-muted")}>
                          {money(c.projected)}
                          {c.limit ? ` / ${money(c.limit)}` : ""}
                        </span>
                      </span>
                      <div className="relative h-2 rounded-full bg-surface-muted">
                        <div className="absolute h-2 rounded-full opacity-35" style={{ width: `${(c.projected / scale) * 100}%`, background: c.color }} />
                        <div className="absolute h-2 rounded-full" style={{ width: `${(c.spent / scale) * 100}%`, background: c.color }} />
                        {c.limit && <div className="absolute -top-1 h-4 w-0.5 bg-danger" style={{ left: `${(c.limit / scale) * 100}%` }} />}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-muted">Solid: spent so far · faded: projected · red tick: budget.</p>
            </Card>
            <Card className="flex flex-col gap-3 p-5">
              <CardHeader title="Monthly trend" subtitle={`Prediction for next month: about ${money(d.forecast.nextMonth)}`} />
              <SimpleBars data={d.forecast.history.map((h) => ({ label: h.month, value: h.total }))} height={220} highlightLast />
              {d.forecast.avgPrev > 0 && <p className="text-[13px] text-muted">Your 3-month average is {money(d.forecast.avgPrev)}.</p>}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="rounded-xl bg-surface-muted px-2 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("tabular text-sm font-bold sm:text-base", tone === "danger" && "text-danger")}>{value}</p>
    </div>
  );
}
