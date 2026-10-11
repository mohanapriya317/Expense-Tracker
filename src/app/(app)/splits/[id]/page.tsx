"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, HandCoins, Pencil, Plus, Trash2, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ExpenseRow } from "@/components/expense-row";
import { useQuickAdd } from "@/components/quick-add";
import { Button, Card, CardHeader, ConfirmDialog, ErrorState, Field, IconButton, Input, PageHeader, Select, Sheet, Skeleton, cn } from "@/components/ui";
import { api } from "@/lib/api";
import { minorToInput, parseAmountInput, shortDate } from "@/lib/format";
import { useInvalidateSpending, useMoney } from "@/lib/hooks";
import type { Expense, Group } from "@/lib/types";
import { BalanceText } from "@/components/balance-text";

export default function GroupPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const money = useMoney();
  const invalidate = useInvalidateSpending();
  const quickAdd = useQuickAdd();
  const q = useQuery({ queryKey: ["group", id], queryFn: () => api.get<{ group: Group; expenses: Expense[] }>(`/api/groups/${id}`) });
  const [settle, setSettle] = useState<{ from: string; to: string; amount: number } | null>(null);
  const [manage, setManage] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const del = useMutation({
    mutationFn: () => api.del(`/api/groups/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success("Group deleted. Its expenses stay in your activity.");
      router.push("/splits");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const g = q.data?.group;
  const me = g?.members.find((m) => m.isMe);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader
        back={
          <Link href="/splits" className="mb-2 flex h-8 items-center gap-1.5 text-sm font-medium text-muted hover:text-fg">
            <ArrowLeft className="size-4" /> Splits
          </Link>
        }
        title={g?.name ?? "Group"}
        subtitle={g ? <BalanceText amount={g.myBalance} /> : undefined}
        actions={
          g && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setManage(true)}>
                <Pencil className="size-4" /> Manage
              </Button>
              <Button size="sm" onClick={() => quickAdd.open("manual")}>
                <Plus className="size-4" /> Shared expense
              </Button>
            </>
          )
        }
      />

      {q.isError ? (
        <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
      ) : !g ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <Card className="flex flex-col gap-4 p-5">
            <CardHeader title="Balances" subtitle={`${money(g.totalSpent)} spent together across ${g.expenseCount} expenses`} />
            <ul className="grid gap-2 sm:grid-cols-2">
              {g.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between rounded-xl bg-surface-muted px-3 py-2.5">
                  <span className="font-medium">{m.name}</span>
                  <span className={cn("tabular text-sm font-semibold", m.balance > 0 ? "text-success" : m.balance < 0 ? "text-danger" : "text-muted")}>
                    {m.balance > 0 ? `gets ${money(m.balance)}` : m.balance < 0 ? `owes ${money(-m.balance)}` : "settled"}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="flex flex-col gap-3 p-5">
            <CardHeader
              title="Settle up"
              subtitle="The fewest payments that square everyone"
              action={
                <Button variant="ghost" size="sm" onClick={() => setSettle({ from: g.members.find((m) => !m.isMe)?.id ?? "", to: me?.id ?? "", amount: 0 })}>
                  <HandCoins className="size-4" /> Record payment
                </Button>
              }
            />
            {g.transfers.length === 0 ? (
              <p className="text-sm text-muted">Everyone is settled up.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {g.transfers.map((t) => (
                  <li key={t.from + t.to} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-3">
                    <span className="font-medium">{t.fromName}</span>
                    <ArrowRight className="size-4 text-muted" />
                    <span className="font-medium">{t.toName}</span>
                    <span className="tabular ml-auto font-semibold">{money(t.amount)}</span>
                    <Button size="sm" variant="soft" onClick={() => setSettle({ from: t.from, to: t.to, amount: t.amount })}>
                      Mark paid
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="px-5 pt-4">
              <h2 className="text-[17px] font-semibold">Shared expenses</h2>
            </div>
            <div className="mt-2 divide-y divide-line border-t border-line">
              {q.data!.expenses.length ? (
                q.data!.expenses.map((e) => <ExpenseRow key={e.id} e={e} showDate href={`/activity/${e.id}`} />)
              ) : (
                <p className="p-5 text-sm text-muted">No shared expenses yet. Add one and turn on “Split with others”.</p>
              )}
            </div>
          </Card>

          {g.settlements.length > 0 && (
            <Card className="flex flex-col gap-2 p-5">
              <CardHeader title="Payments" />
              <ul className="flex flex-col divide-y divide-line">
                {g.settlements.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 py-2.5 text-sm">
                    <span>
                      <strong>{s.fromName}</strong> paid <strong>{s.toName}</strong>
                      {s.note && <span className="text-muted"> · {s.note}</span>}
                    </span>
                    <span className="ml-auto text-muted">{shortDate(s.date)}</span>
                    <span className="tabular w-24 text-right font-semibold">{money(s.amount)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <SettleSheet group={g} value={settle} onClose={() => setSettle(null)} />
          <ManageSheet group={g} open={manage} onClose={() => setManage(false)} onDelete={() => setConfirmDelete(true)} />
          <ConfirmDialog
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            onConfirm={() => del.mutate()}
            loading={del.isPending}
            title={`Delete ${g.name}?`}
            body="Balances and payment history are removed. Your expenses stay in Activity with your share."
          />
        </>
      )}
    </div>
  );
}

function SettleSheet({ group, value, onClose }: { group: Group; value: { from: string; to: string; amount: number } | null; onClose: () => void }) {
  const invalidate = useInvalidateSpending();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [seed, setSeed] = useState<typeof value>(null);

  if (value && value !== seed) {
    setSeed(value);
    setFrom(value.from);
    setTo(value.to);
    setAmount(minorToInput(value.amount));
    setNote("");
  }

  const save = useMutation({
    mutationFn: () => {
      const a = parseAmountInput(amount);
      if (!a) throw new Error("Enter an amount.");
      if (from === to) throw new Error("Pick two different people.");
      return api.post(`/api/groups/${group.id}/settle`, { from, to, amount: a, note });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Payment recorded");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet
      open={!!value}
      onClose={onClose}
      title="Record a payment"
      footer={
        <Button className="w-full" size="lg" onClick={() => save.mutate()} loading={save.isPending}>
          Record payment
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Who paid" htmlFor="s-from">
            <Select id="s-from" value={from} onChange={(e) => setFrom(e.target.value)}>
              {group.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Paid to" htmlFor="s-to">
            <Select id="s-to" value={to} onChange={(e) => setTo(e.target.value)}>
              {group.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Amount" htmlFor="s-amount">
          <Input id="s-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Note (optional)" htmlFor="s-note">
          <Input id="s-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="UPI, cash…" />
        </Field>
      </div>
    </Sheet>
  );
}

function ManageSheet({ group, open, onClose, onDelete }: { group: Group; open: boolean; onClose: () => void; onDelete: () => void }) {
  const invalidate = useInvalidateSpending();
  const [name, setName] = useState(group.name);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/api/groups/${group.id}`, body),
    onSuccess: () => {
      invalidate();
      toast.success("Group updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onClose={onClose} title="Manage group">
      <div className="flex flex-col gap-6">
        <div className="flex items-end gap-2">
          <Field label="Name" htmlFor="m-name" className="flex-1">
            <Input id="m-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button variant="secondary" onClick={() => patch.mutate({ name })} disabled={!name.trim() || name === group.name}>
            Rename
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-muted">People</span>
          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
            {group.members.map((m) => (
              <li key={m.id} className="flex items-center gap-2 px-3 py-2">
                <span className="flex-1">
                  {m.name}
                  {m.email && <span className="block text-xs text-muted">{m.email}</span>}
                </span>
                {!m.isMe && (
                  <IconButton label={`Remove ${m.name}`} onClick={() => patch.mutate({ removeMemberId: m.id })} className="size-9 text-muted">
                    <X className="size-4" />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" aria-label="New person's name" />
            <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Email (optional)" aria-label="New person's email" />
            <Button
              variant="soft"
              onClick={() => {
                if (!newName.trim()) return;
                patch.mutate({ addMembers: [{ name: newName.trim(), email: newEmail.trim() }] });
                setNewName("");
                setNewEmail("");
              }}
            >
              <UserPlus className="size-4" />
            </Button>
          </div>
        </div>
        <Button variant="danger" onClick={onDelete}>
          <Trash2 className="size-4" /> Delete group
        </Button>
      </div>
    </Sheet>
  );
}
