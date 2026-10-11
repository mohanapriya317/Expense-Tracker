"use client";

import { useQuery } from "@tanstack/react-query";
import { Camera, Keyboard, Mic, TrendingDown, TrendingUp, TriangleAlert, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Donut, TrendChart } from "@/components/charts";
import { ExpenseRow } from "@/components/expense-row";
import { MonthSwitcher, useCurrentMonthKey } from "@/components/month-switcher";
import { useQuickAdd } from "@/components/quick-add";
import { Button, Card, CardHeader, EmptyState, ErrorState, Progress, Skeleton, cn } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe, useMoney } from "@/lib/hooks";
import type { Dashboard } from "@/lib/types";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function DashboardPage() {
  const current = useCurrentMonthKey();
  const [month, setMonth] = useState<string | null>(null);
  const key = month ?? current;
  const me = useMe();
  const money = useMoney();
  const quickAdd = useQuickAdd();
  const q = useQuery({ queryKey: ["dashboard", key], queryFn: () => api.get<Dashboard>(`/api/dashboard?month=${key}`) });
  const d = q.data;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">
            {greeting()}, {me.data?.user.name.split(" ")[0]}
          </p>
          <h1 className="text-2xl font-bold tracking-tight">{d?.label ?? "Overview"}</h1>
        </div>
        <MonthSwitcher value={key} onChange={setMonth} />
      </div>

      {q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : !d ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="flex flex-col gap-3 p-5 lg:col-span-2">
              <span className="text-[13px] font-medium text-muted">{d.progress.isCurrent ? "Spent this month" : `Spent in ${d.label}`}</span>
              <span className="tabular text-4xl font-bold tracking-tight sm:text-[40px]">{money(d.total)}</span>
              {d.overallBudget ? (
                <>
                  <span className="text-sm text-muted">
                    of {money(d.overallBudget.limit)} budget ·{" "}
                    <strong className={cn("font-semibold", d.overallBudget.left >= 0 ? "text-success" : "text-danger")}>
                      {d.overallBudget.left >= 0 ? `${money(d.overallBudget.left)} left` : `${money(-d.overallBudget.left)} over`}
                    </strong>
                  </span>
                  <Progress
                    value={d.overallBudget.pct}
                    tone={d.overallBudget.state === "over" ? "danger" : d.overallBudget.state === "warning" ? "warning" : "primary"}
                    marker={d.progress.isCurrent ? ((d.progress.daysElapsed) / (d.progress.daysElapsed + d.progress.daysLeft)) * 100 : undefined}
                    label="Overall budget used"
                  />
                </>
              ) : (
                <Link href="/budgets" className="text-sm font-medium text-primary">
                  Set a monthly budget →
                </Link>
              )}
              <div className="flex flex-wrap justify-between gap-2 text-[13px] text-muted">
                <span>{d.progress.isCurrent ? `${d.progress.daysLeft} days left · ${d.count} expenses` : `${d.count} expenses`}</span>
                {d.changePct != null && (
                  <span className={cn("flex items-center gap-1 font-medium", d.changePct > 0 ? "text-danger" : "text-success")}>
                    {d.changePct > 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                    {Math.abs(d.changePct)}% vs last month
                  </span>
                )}
              </div>
            </Card>

            <Link href="/insights" className="flex items-center gap-4 rounded-2xl bg-primary-soft p-5 transition hover:brightness-[0.98]">
              <span className="flex size-16 shrink-0 items-center justify-center rounded-full border-[5px] border-primary text-xl font-bold text-primary-ink">{d.health.score}</span>
              <span className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-primary-ink">Financial health · {d.health.label}</span>
                {d.health.tip && <span className="text-[13px] leading-snug text-primary-ink/80">{d.health.tip}</span>}
              </span>
            </Link>
          </div>

          {d.alerts.length > 0 && (
            <div className="flex flex-col gap-2">
              {d.alerts.slice(0, 3).map((a) => (
                <Link
                  key={a.id}
                  href={`/budgets/${a.id}`}
                  className={cn("flex items-center gap-3 rounded-xl border p-3 text-sm", a.state === "over" ? "border-danger/30 bg-danger-soft text-danger" : "border-warning/40 bg-warning-soft text-warning-ink")}
                >
                  <TriangleAlert className="size-5 shrink-0" />
                  <span className="flex-1">
                    {a.state === "over" ? (
                      <>
                        <strong>{a.name}</strong> is over budget by {money(-a.left)}
                      </>
                    ) : (
                      <>
                        <strong>{a.name}</strong> is at {a.pct}% of its {money(a.limit)} budget
                      </>
                    )}
                  </span>
                  <span className="font-semibold">View</span>
                </Link>
              ))}
            </div>
          )}

          {d.count === 0 && d.progress.isCurrent ? (
            <Card>
              <EmptyState
                icon={<Wallet className="size-6" />}
                title="Log your first expense"
                body="Type something like “petrol 200”, say it, or upload a receipt screenshot."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button onClick={() => quickAdd.open("text")}>
                      <Keyboard className="size-4" /> Type it
                    </Button>
                    <Button variant="secondary" onClick={() => quickAdd.open("voice")}>
                      <Mic className="size-4" /> Say it
                    </Button>
                    <Button variant="secondary" onClick={() => quickAdd.open("text")}>
                      <Camera className="size-4" /> Receipt
                    </Button>
                  </div>
                }
              />
            </Card>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Card className="flex flex-col gap-4 p-5">
                  <CardHeader title="Where it went" />
                  {d.byCategory.length ? (
                    <div className="flex items-center gap-5">
                      <Donut data={d.byCategory} total={d.total} size={124} />
                      <ul className="flex min-w-0 flex-1 flex-col gap-2 text-[13px]">
                        {d.byCategory.slice(0, 5).map((c) => (
                          <li key={c.categoryId}>
                            <Link href={`/activity?month=${key}&category=${c.categoryId}`} className="flex items-center gap-2 hover:underline">
                              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: c.color }} />
                              <span className="flex-1 truncate">{c.name}</span>
                              <span className="tabular font-semibold">{money(c.total)}</span>
                            </Link>
                          </li>
                        ))}
                        {d.byCategory.length > 5 && <li className="text-muted">+{d.byCategory.length - 5} more</li>}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-sm text-muted">No spending in this month.</p>
                  )}
                </Card>

                <Card className="flex flex-col gap-3 p-5">
                  <CardHeader title="Daily spend" subtitle="Running total vs last month" />
                  <TrendChart data={d.daily} height={170} />
                  <div className="flex gap-4 text-xs text-muted">
                    <span className="flex items-center gap-1.5">
                      <span className="h-0.5 w-4 bg-primary" /> This month
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-0.5 w-4 border-t-2 border-dashed border-muted" /> Last month
                    </span>
                  </div>
                </Card>

                <Card className="flex flex-col gap-4 p-5 md:col-span-2 xl:col-span-1">
                  <CardHeader
                    title="Budgets"
                    action={
                      <Link href="/budgets" className="text-sm font-medium text-primary">
                        See all
                      </Link>
                    }
                  />
                  {d.categoryBudgets.length ? (
                    <ul className="flex flex-col gap-3.5">
                      {d.categoryBudgets.slice(0, 4).map((b) => (
                        <li key={b.id}>
                          <Link href={`/budgets/${b.id}`} className="flex flex-col gap-1.5">
                            <span className="flex justify-between text-[13px]">
                              <span className="font-medium">{b.category?.name}</span>
                              <span className={cn("tabular font-semibold", b.state === "over" ? "text-danger" : b.state === "warning" ? "text-warning" : "text-muted")}>
                                {b.pct}%{b.state === "over" ? " · over" : ""}
                              </span>
                            </span>
                            <Progress value={b.pct} tone={b.state === "over" ? "danger" : b.state === "warning" ? "warning" : "primary"} label={`${b.category?.name} budget`} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">
                      No category budgets yet.{" "}
                      <Link href="/budgets" className="font-medium text-primary">
                        Add one
                      </Link>
                    </p>
                  )}
                </Card>
              </div>

              <Card className="overflow-hidden">
                <div className="flex items-center justify-between px-5 pt-4">
                  <h2 className="text-[17px] font-semibold">Recent</h2>
                  <Link href="/activity" className="text-sm font-medium text-primary">
                    See all
                  </Link>
                </div>
                <div className="mt-2 divide-y divide-line border-t border-line">
                  {d.recent.map((e) => (
                    <ExpenseRow key={e.id} e={e} showDate href={`/activity/${e.id}`} />
                  ))}
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-44 lg:col-span-2" />
        <Skeleton className="h-44" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}
