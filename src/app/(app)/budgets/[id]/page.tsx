"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { BudgetSheet } from "@/components/budget-sheet";
import { BudgetLineChart } from "@/components/charts";
import { ExpenseRow } from "@/components/expense-row";
import { MonthSwitcher, useCurrentMonthKey } from "@/components/month-switcher";
import { Button, Card, CardHeader, ConfirmDialog, ErrorState, PageHeader, Progress, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { useInvalidateSpending, useMoney } from "@/lib/hooks";
import type { BudgetItem, Expense, Progress as P } from "@/lib/types";

interface Detail {
  monthKey: string;
  label: string;
  progress: P;
  budget: BudgetItem;
  cumulative: { day: number; spent: number | null; limit: number; pace: number }[];
  topMerchants: { name: string; total: number }[];
  expenses: Expense[];
}

export default function BudgetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const current = useCurrentMonthKey();
  const [month, setMonth] = useState<string | null>(null);
  const key = month ?? current;
  const money = useMoney();
  const invalidate = useInvalidateSpending();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const q = useQuery({ queryKey: ["budget", id, key], queryFn: () => api.get<Detail>(`/api/budgets/${id}?month=${key}`) });
  const del = useMutation({
    mutationFn: () => api.del(`/api/budgets/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success("Budget removed");
      router.push("/budgets");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const d = q.data;
  const b = d?.budget;
  const name = b?.category?.name ?? "Overall";
  const tone = b?.state === "over" ? "danger" : b?.state === "warning" ? "warning" : "primary";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader
        back={
          <Link href="/budgets" className="mb-2 flex h-8 items-center gap-1.5 text-sm font-medium text-muted hover:text-fg">
            <ArrowLeft className="size-4" /> Budgets
          </Link>
        }
        title={b ? `${name} budget` : "Budget"}
        actions={<MonthSwitcher value={key} onChange={setMonth} />}
      />

      {q.isError ? (
        <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
      ) : !d || !b ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          <Card className="flex flex-col gap-3 p-5">
            <div className="flex items-baseline gap-2">
              <span className="tabular text-3xl font-bold">{money(b.spent)}</span>
              <span className="text-sm text-muted">of {money(b.limit)} in {d.label}</span>
            </div>
            <Progress value={b.pct} tone={tone} label={`${name} budget used`} />
            <p className="text-sm text-muted">
              {b.left >= 0 ? `${money(b.left)} left` : `${money(-b.left)} over`}
              {d.progress.isCurrent && ` · ${d.progress.daysLeft} days to go · about ${money(Math.floor(Math.max(b.left, 0) / Math.max(d.progress.daysLeft, 1) / 100) * 100)} a day`}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="size-4" /> Edit limit and alerts
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirm(true)} className="text-danger">
                <Trash2 className="size-4" /> Remove
              </Button>
            </div>
            <p className="text-xs text-muted">Alerts at {b.alertAt.map((a) => `${a}%`).join(", ")}</p>
          </Card>

          <Card className="flex flex-col gap-3 p-5">
            <CardHeader title="Spending against the limit" subtitle="Running total by day; the dotted line is an even pace" />
            <BudgetLineChart data={d.cumulative} />
          </Card>

          {d.topMerchants.length > 0 && (
            <Card className="flex flex-col gap-3 p-5">
              <CardHeader title="What drove it" />
              <ul className="flex flex-col gap-2.5">
                {d.topMerchants.map((m) => (
                  <li key={m.name} className="flex flex-col gap-1">
                    <span className="flex justify-between text-sm">
                      <span>{m.name}</span>
                      <span className="tabular font-semibold">{money(m.total)}</span>
                    </span>
                    <Progress value={(m.total / Math.max(b.spent, 1)) * 100} label={`${m.name} share`} />
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="px-5 pt-4">
              <h2 className="text-[17px] font-semibold">Transactions</h2>
            </div>
            <div className="mt-2 divide-y divide-line border-t border-line">
              {d.expenses.length ? d.expenses.map((e) => <ExpenseRow key={e.id} e={e} showDate href={`/activity/${e.id}`} />) : <p className="p-5 text-sm text-muted">Nothing spent here this month.</p>}
            </div>
          </Card>

          <BudgetSheet open={editing} existing={b} taken={[]} onClose={() => setEditing(false)} />
          <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => del.mutate()} loading={del.isPending} title={`Remove the ${name} budget?`} body="Your expenses stay. Only the limit and its alerts are removed." confirmLabel="Remove" />
        </>
      )}
    </div>
  );
}
