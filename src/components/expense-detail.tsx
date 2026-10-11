"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Pencil, Split, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { dateTimeLabel } from "@/lib/format";
import { useInvalidateSpending, useMoney } from "@/lib/hooks";
import type { Expense } from "@/lib/types";
import { CategoryIcon } from "./category";
import { ExpenseForm, draftFromExpense, type ExpenseSubmit } from "./expense-form";
import { Badge, Button, ConfirmDialog, ErrorState, Skeleton } from "./ui";

interface DetailResponse {
  expense: Expense;
  receipt: { id: string; status: string; mimeType?: string; ocrText: string } | null;
  group: { id: string; name: string; members: { id: string; name: string; isMe: boolean }[] } | null;
}

const SOURCE: Record<string, string> = { text: "Typed", voice: "Voice", receipt: "Receipt", manual: "Manual", import: "Imported", demo: "Demo" };

/** Re-creates a deleted expense from its last known state (used by Undo). */
export function restorePayload(e: Expense) {
  return {
    amount: e.amount,
    categoryId: e.categoryId,
    merchant: e.merchant,
    note: e.note,
    occurredAt: e.occurredAt,
    paymentMethod: e.paymentMethod,
    source: e.source === "demo" ? "manual" : e.source,
    receiptId: e.receiptId,
    split: e.split?.groupId ? { groupId: e.split.groupId, paidBy: e.split.paidBy, method: e.split.method, shares: e.split.shares.map((s) => ({ memberId: s.memberId, amount: s.amount })) } : null,
  };
}

export function ExpenseDetail({ id, onDeleted, startEditing }: { id: string; onDeleted?: () => void; startEditing?: boolean }) {
  const money = useMoney();
  const invalidate = useInvalidateSpending();
  const [editing, setEditing] = useState(!!startEditing);
  const [confirm, setConfirm] = useState(false);
  const [showOcr, setShowOcr] = useState(false);
  const q = useQuery({ queryKey: ["expense", id], queryFn: () => api.get<DetailResponse>(`/api/expenses/${id}`) });

  const update = useMutation({
    mutationFn: (v: ExpenseSubmit) => api.patch<{ expense: Expense }>(`/api/expenses/${id}`, v),
    onSuccess: ({ expense }, v) => {
      const before = q.data?.expense;
      invalidate();
      setEditing(false);
      toast.success("Changes saved");
      if (before && before.categoryId !== v.categoryId && expense.merchant) {
        toast(`Always put ${expense.merchant} in ${expense.category?.name}?`, {
          duration: 8000,
          action: {
            label: "Always",
            onClick: () =>
              api
                .post("/api/rules", { match: expense.merchant, categoryId: v.categoryId })
                .then(() => toast.success(`We'll remember ${expense.merchant} → ${expense.category?.name}`))
                .catch((e: Error) => toast.error(e.message)),
          },
        });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/api/expenses/${id}`),
    onSuccess: () => {
      const e = q.data!.expense;
      invalidate();
      setConfirm(false);
      onDeleted?.();
      toast("Expense deleted", {
        action: {
          label: "Undo",
          onClick: () =>
            api
              .post("/api/expenses", restorePayload(e))
              .then(() => {
                invalidate();
                toast.success("Restored");
              })
              .catch((err: Error) => toast.error(err.message)),
        },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isError) return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const { expense: e, receipt, group } = q.data;

  if (editing) {
    return (
      <ExpenseForm
        formId={`edit-${e.id}`}
        initial={draftFromExpense(e)}
        showConfidence={false}
        submitting={update.isPending}
        submitLabel="Save changes"
        onSubmit={(v) => update.mutate(v)}
        secondary={
          <Button variant="secondary" size="lg" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        }
      />
    );
  }

  const memberName = (mid: string) => group?.members.find((m) => m.id === mid)?.name ?? e.split?.shares.find((s) => s.memberId === mid)?.name ?? "Someone";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-4">
        <CategoryIcon icon={e.category?.icon} color={e.category?.color} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="tabular text-3xl font-bold tracking-tight">{money(e.amount)}</p>
          <p className="truncate text-base font-medium">{e.title}</p>
          {e.split && e.myShare !== e.amount && <p className="text-sm text-muted">Your share: {money(e.myShare)}</p>}
        </div>
      </div>

      {receipt && (
        <div className="flex flex-col gap-2">
          {receipt.mimeType === "application/pdf" ? (
            <a href={`/api/receipts/${receipt.id}`} target="_blank" rel="noreferrer" className="flex h-24 items-center justify-center rounded-xl border border-line bg-surface-muted text-sm font-medium text-primary">
              Open PDF receipt
            </a>
          ) : (
            <a href={`/api/receipts/${receipt.id}`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/receipts/${receipt.id}`} alt="Receipt" className="max-h-72 w-full rounded-xl border border-line bg-surface-muted object-contain" />
            </a>
          )}
          {receipt.ocrText && (
            <button type="button" onClick={() => setShowOcr((v) => !v)} className="self-start text-xs font-medium text-primary">
              {showOcr ? "Hide" : "Show"} text we read
            </button>
          )}
          {showOcr && <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-surface-muted p-3 text-xs text-muted">{receipt.ocrText}</pre>}
        </div>
      )}

      <dl className="grid grid-cols-[110px_1fr] gap-y-3 text-[15px]">
        <dt className="text-muted">Category</dt>
        <dd>{e.category?.name ?? "—"}</dd>
        <dt className="text-muted">Date</dt>
        <dd>{dateTimeLabel(e.occurredAt)}</dd>
        {e.merchant && e.note && (
          <>
            <dt className="text-muted">Note</dt>
            <dd>{e.note}</dd>
          </>
        )}
        <dt className="text-muted">Paid with</dt>
        <dd>{e.paymentMethod ?? "—"}</dd>
        <dt className="text-muted">Added by</dt>
        <dd className="flex flex-wrap items-center gap-1.5">
          {SOURCE[e.source] ?? e.source}
          {!!e.aiMeta?.edited?.length && <Badge>you corrected {e.aiMeta.edited.join(", ")}</Badge>}
        </dd>
        {e.aiMeta?.rawInput && (
          <>
            <dt className="text-muted">You said</dt>
            <dd className="italic">“{e.aiMeta.rawInput}”</dd>
          </>
        )}
      </dl>

      {e.split && (
        <div className="flex flex-col gap-2 rounded-xl bg-surface-muted p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Split className="size-4" /> Split {e.split.method === "equal" ? "equally" : e.split.method === "exact" ? "by amount" : "by percent"}
            {group && (
              <Link href={`/splits/${group.id}`} className="ml-auto font-medium text-primary">
                {group.name} →
              </Link>
            )}
          </p>
          <p className="text-sm text-muted">Paid by {memberName(e.split.paidBy)}</p>
          <ul className="flex flex-col gap-1 text-sm">
            {e.split.shares.map((s) => (
              <li key={s.memberId} className="flex justify-between">
                <span>{memberName(s.memberId)}</span>
                <span className="tabular font-medium">{money(s.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={() => setEditing(true)}>
          <Pencil className="size-4" /> Edit
        </Button>
        <Button variant="danger" onClick={() => setConfirm(true)}>
          <Trash2 className="size-4" /> Delete
        </Button>
      </div>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        title="Delete this expense?"
        body={`${money(e.amount)} · ${e.title}. You can undo right after.`}
      />
    </div>
  );
}
