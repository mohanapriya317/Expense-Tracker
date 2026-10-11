"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { BalanceText } from "@/components/balance-text";
import { Button, Card, EmptyState, ErrorState, Field, IconButton, Input, PageHeader, Sheet, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { useInvalidateSpending, useMoney } from "@/lib/hooks";
import type { Group } from "@/lib/types";

export default function SplitsPage() {
  const money = useMoney();
  const [creating, setCreating] = useState(false);
  const q = useQuery({ queryKey: ["groups"], queryFn: () => api.get<{ groups: Group[] }>("/api/groups") });
  const groups = q.data?.groups;
  const owed = groups?.reduce((s, g) => s + Math.max(g.myBalance, 0), 0) ?? 0;
  const owe = groups?.reduce((s, g) => s + Math.max(-g.myBalance, 0), 0) ?? 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader
        title="Splits"
        subtitle="Share costs with friends, flatmates or colleagues."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> New group
          </Button>
        }
      />

      {q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : !groups ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState icon={<Users className="size-6" />} title="No groups yet" body="Create a group for your flat, a trip or office lunches. Then turn on “Split with others” when you add an expense." action={<Button onClick={() => setCreating(true)}>Create a group</Button>} />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4">
              <p className="text-[13px] text-muted">You are owed</p>
              <p className="tabular text-2xl font-bold text-success">{money(owed)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[13px] text-muted">You owe</p>
              <p className="tabular text-2xl font-bold text-danger">{money(owe)}</p>
            </Card>
          </div>
          <div className="flex flex-col gap-3">
            {groups.map((g) => (
              <Link key={g.id} href={`/splits/${g.id}`} className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 transition-colors hover:bg-surface-muted/60">
                <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary-ink">
                  <Users className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{g.name}</span>
                  <span className="block truncate text-[13px] text-muted">
                    {g.members.length} people · {g.expenseCount} expenses · {money(g.totalSpent)}
                  </span>
                </span>
                <BalanceText amount={g.myBalance} className="text-right text-sm" />
              </Link>
            ))}
          </div>
        </>
      )}

      <NewGroupSheet open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function NewGroupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const invalidate = useInvalidateSpending();
  const [name, setName] = useState("");
  const [members, setMembers] = useState<{ name: string; email: string }[]>([{ name: "", email: "" }]);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      const list = members.filter((m) => m.name.trim());
      if (!name.trim()) throw new Error("Name the group.");
      if (!list.length) throw new Error("Add at least one other person.");
      return api.post<{ group: Group }>("/api/groups", { name, members: list.map((m) => ({ name: m.name.trim(), email: m.email.trim() })) });
    },
    onSuccess: ({ group }) => {
      invalidate();
      toast.success(`Created ${group.name}`);
      onClose();
      setName("");
      setMembers([{ name: "", email: "" }]);
      router.push(`/splits/${group.id}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New group"
      footer={
        <Button className="w-full" size="lg" onClick={() => create.mutate()} loading={create.isPending}>
          Create group
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Group name" htmlFor="g-name">
          <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Flatmates, Goa trip…" data-autofocus/>
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-muted">People (you&apos;re added automatically)</span>
          {members.map((m, i) => (
            <div key={i} className="flex gap-2">
              <Input value={m.name} onChange={(e) => setMembers((ms) => ms.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Name" aria-label={`Person ${i + 1} name`} />
              <Input value={m.email} onChange={(e) => setMembers((ms) => ms.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} placeholder="Email (optional)" type="email" aria-label={`Person ${i + 1} email`} />
              <IconButton label="Remove person" onClick={() => setMembers((ms) => (ms.length > 1 ? ms.filter((_, j) => j !== i) : ms))} className="shrink-0 text-muted">
                <X className="size-4" />
              </IconButton>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setMembers((ms) => [...ms, { name: "", email: "" }])} className="self-start">
            <Plus className="size-4" /> Add person
          </Button>
        </div>
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
