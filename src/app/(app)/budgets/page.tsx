"use client";

import { useQuery } from "@tanstack/react-query";
import { ChartPie, CircleAlert, Pencil, Plus, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BudgetSheet } from "@/components/budget-sheet";
import { CategoryIcon } from "@/components/category";
import { MonthSwitcher, useCurrentMonthKey } from "@/components/month-switcher";
import { Badge, Button, Card, EmptyState, ErrorState, IconButton, PageHeader, Progress, Skeleton, cn } from "@/components/ui";
import { api } from "@/lib/api";
import { useMoney } from "@/lib/hooks";
import type { BudgetItem, BudgetsResponse } from "@/lib/types";

function StateBadge({ b }: { b: BudgetItem }) {
  const money = useMoney();
  if (b.state === "over")
    return (
      <Badge tone="danger">
        <CircleAlert className="size-3.5" /> Over by {money(-b.left)}
      </Badge>
    );
  if (b.state === "warning")
    return (
      <Badge tone="warning">
        <TriangleAlert className="size-3.5" /> {b.pct}%
      </Badge>
    );
  return <span className="text-[13px] text-muted">{b.pct}%</span>;
}

export default function BudgetsPage() {
  const current = useCurrentMonthKey();
  const [month, setMonth] = useState<string | null>(null);
  const key = month ?? current;
  const money = useMoney();
  const [sheet, setSheet] = useState<{ open: boolean; existing?: BudgetItem | null }>({ open: false });
  const q = useQuery({ queryKey: ["budgets", key], queryFn: () => api.get<BudgetsResponse>(`/api/budgets?month=${key}`) });
  const d = q.data;
  const taken = d ? [...(d.overall ? [null] : []), ...d.categories.map((c) => c.categoryId)] : [];
  const pace = d?.progress.isCurrent ? (d.progress.daysElapsed / (d.progress.daysElapsed + d.progress.daysLeft)) * 100 : undefined;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader
        title="Budgets"
        subtitle={d ? `${d.label}${d.progress.isCurrent ? ` · ${d.progress.daysLeft} days left` : ""}` : " "}
        actions={
          <>
            <MonthSwitcher value={key} onChange={setMonth} />
            <Button onClick={() => setSheet({ open: true })}>
              <Plus className="size-4" /> New
            </Button>
          </>
        }
      />

      {q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : !d ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : !d.overall && d.categories.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ChartPie className="size-6" />}
            title="No budgets yet"
            body={`Set a monthly limit and we'll warn you at 80% and when you go over. You've spent ${money(d.totalSpent)} so far this month.`}
            action={<Button onClick={() => setSheet({ open: true })}>Add a budget</Button>}
          />
        </Card>
      ) : (
        <>
          {d.overall ? (
            <Card className="flex flex-col gap-3 p-5">
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-semibold">Overall</span>
                <div className="flex items-center gap-2">
                  <StateBadge b={d.overall} />
                  <IconButton label="Edit overall budget" onClick={() => setSheet({ open: true, existing: d.overall })} className="size-9">
                    <Pencil className="size-4" />
                  </IconButton>
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="tabular text-3xl font-bold">{money(d.overall.spent)}</span>
                <span className="text-sm text-muted">of {money(d.overall.limit)}</span>
              </div>
              <Progress value={d.overall.pct} marker={pace} tone={d.overall.state === "over" ? "danger" : d.overall.state === "warning" ? "warning" : "primary"} label="Overall budget used" />
              {d.progress.isCurrent && (
                <p className={cn("text-[13px]", d.overall.projected > d.overall.limit ? "text-warning" : "text-muted")}>
                  {d.overall.projected > d.overall.limit
                    ? `At this pace you'll spend about ${money(d.overall.projected)} by month end, ${money(d.overall.projected - d.overall.limit)} over.`
                    : `On track: about ${money(d.overall.projected)} by month end. The black tick shows where an even pace would be today.`}
                </p>
              )}
              <Link href={`/budgets/${d.overall.id}`} className="self-start text-sm font-medium text-primary">
                Details →
              </Link>
            </Card>
          ) : (
            <button type="button" onClick={() => setSheet({ open: true })} className="h-14 rounded-2xl border border-dashed border-line text-sm font-medium text-muted hover:bg-surface">
              + Add an overall monthly budget
            </button>
          )}

          {d.categories.length > 0 && <h2 className="mt-2 text-[13px] font-semibold uppercase tracking-wide text-muted">By category</h2>}
          <div className="grid gap-3 sm:grid-cols-2">
            {d.categories.map((b) => (
              <Card key={b.id} className={cn("p-4", b.state === "over" && "border-danger/40", b.state === "warning" && "border-warning/50")}>
                <Link href={`/budgets/${b.id}`} className="flex flex-col gap-2.5">
                  <span className="flex items-center gap-2.5">
                    <CategoryIcon icon={b.category?.icon} color={b.category?.color} size="sm" />
                    <span className="flex-1 font-semibold">{b.category?.name}</span>
                    <StateBadge b={b} />
                  </span>
                  <Progress value={b.pct} tone={b.state === "over" ? "danger" : b.state === "warning" ? "warning" : "primary"} label={`${b.category?.name} budget used`} />
                  <span className="flex justify-between text-[13px] text-muted">
                    <span className="tabular">
                      {money(b.spent)} of {money(b.limit)}
                    </span>
                    <span>{b.left >= 0 ? `${money(b.left)} left` : "over"}</span>
                  </span>
                  {d.progress.isCurrent && b.projected > b.limit && b.state !== "over" && <span className="text-xs text-warning">Likely to reach {money(b.projected)} by month end</span>}
                </Link>
              </Card>
            ))}
          </div>
          <button type="button" onClick={() => setSheet({ open: true })} className="h-13 rounded-2xl border border-dashed border-line text-sm font-medium text-muted hover:bg-surface">
            + Add a budget for another category
          </button>
        </>
      )}

      <BudgetSheet open={sheet.open} existing={sheet.existing} taken={taken} onClose={() => setSheet({ open: false })} />
    </div>
  );
}
