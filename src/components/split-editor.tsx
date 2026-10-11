"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useMoney } from "@/lib/hooks";
import type { Group } from "@/lib/types";
import { Button, Field, Input, Segmented, Select, cn } from "./ui";

export type SplitMethod = "equal" | "exact" | "percent";

export interface SplitDraft {
  groupId: string;
  paidBy: string;
  method: SplitMethod;
  included: string[]; // member ids
  values: Record<string, string>; // rupees for exact, % for percent
}

export interface SplitPayload {
  groupId: string;
  paidBy: string;
  method: SplitMethod;
  shares: { memberId: string; amount: number }[];
}

/** Turns the editor state into exact shares in minor units, or an error message. */
export function computeShares(amount: number | null, d: SplitDraft): { shares?: SplitPayload["shares"]; error?: string } {
  if (!amount) return { error: "Enter the amount first." };
  if (d.included.length < 2) return { error: "Pick at least two people." };
  if (d.method === "equal") {
    const each = Math.floor(amount / d.included.length);
    const rem = amount - each * d.included.length;
    return { shares: d.included.map((id, i) => ({ memberId: id, amount: each + (id === d.paidBy || (!d.included.includes(d.paidBy) && i === 0) ? rem : 0) })) };
  }
  if (d.method === "exact") {
    const shares = d.included.map((id) => ({ memberId: id, amount: Math.round(Number(d.values[id] || 0) * 100) }));
    const sum = shares.reduce((a, s) => a + s.amount, 0);
    if (sum !== amount) return { error: `Shares add up to ${sum / 100}, not ${amount / 100}.`, shares };
    return { shares };
  }
  const pcts = d.included.map((id) => Number(d.values[id] || 0));
  const totalPct = pcts.reduce((a, b) => a + b, 0);
  if (Math.abs(totalPct - 100) > 0.01) return { error: `Percentages add up to ${totalPct}%, not 100%.` };
  const shares = d.included.map((id, i) => ({ memberId: id, amount: Math.floor((amount * pcts[i]) / 100) }));
  const rem = amount - shares.reduce((a, s) => a + s.amount, 0);
  const payer = shares.find((s) => s.memberId === d.paidBy) ?? shares[0];
  payer.amount += rem;
  return { shares };
}

export function SplitEditor({ amount, value, onChange, suggestedNames = [] }: { amount: number | null; value: SplitDraft | null; onChange: (d: SplitDraft | null) => void; suggestedNames?: string[] }) {
  const money = useMoney();
  const qc = useQueryClient();
  const groups = useQuery({ queryKey: ["groups"], queryFn: () => api.get<{ groups: Group[] }>("/api/groups"), select: (d) => d.groups });
  const [newNames, setNewNames] = useState(suggestedNames.join(", "));
  const group = groups.data?.find((g) => g.id === value?.groupId);

  const pick = (g: Group) => {
    const me = g.members.find((m) => m.isMe) ?? g.members[0];
    onChange({ groupId: g.id, paidBy: me.id, method: "equal", included: g.members.map((m) => m.id), values: {} });
  };

  // Preselect a group that contains everyone mentioned ("with Ravi and Anu"), else the first group.
  useEffect(() => {
    if (value || !groups.data?.length) return;
    const lower = suggestedNames.map((n) => n.toLowerCase());
    const match = groups.data.find((g) => lower.length && lower.every((n) => g.members.some((m) => m.name.toLowerCase() === n))) ?? groups.data[0];
    pick(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.data]);

  const create = useMutation({
    mutationFn: (names: string[]) => api.post<{ group: Group }>("/api/groups", { name: names.join(", "), members: names.map((n) => ({ name: n })) }),
    onSuccess: ({ group }) => {
      qc.setQueryData<{ groups: Group[] }>(["groups"], (old) => ({ groups: [group, ...(old?.groups ?? [])] }));
      pick(group);
      toast.success(`Group "${group.name}" created`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const result = useMemo(() => (value ? computeShares(amount, value) : null), [amount, value]);

  if (groups.isLoading) return <p className="text-sm text-muted">Loading groups…</p>;

  if (!groups.data?.length || !value) {
    return (
      <div className="flex flex-col gap-3 rounded-xl bg-surface-muted p-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Users className="size-4" /> Who are you splitting with?
        </p>
        <Input value={newNames} onChange={(e) => setNewNames(e.target.value)} placeholder="Ravi, Anu" aria-label="Names, separated by commas" />
        <Button
          variant="soft"
          size="sm"
          loading={create.isPending}
          onClick={() => {
            const names = newNames.split(",").map((n) => n.trim()).filter(Boolean);
            if (!names.length) return toast.error("Add at least one name.");
            create.mutate(names);
          }}
        >
          Create group and split
        </Button>
      </div>
    );
  }

  const set = (patch: Partial<SplitDraft>) => onChange({ ...value, ...patch });
  const toggle = (id: string) => set({ included: value.included.includes(id) ? value.included.filter((x) => x !== id) : [...value.included, id] });
  const shareOf = (id: string) => result?.shares?.find((s) => s.memberId === id)?.amount;

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-surface-muted p-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Group" htmlFor="split-group">
          <Select id="split-group" value={value.groupId} onChange={(e) => pick(groups.data!.find((g) => g.id === e.target.value)!)}>
            {groups.data.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Paid by" htmlFor="split-payer">
          <Select id="split-payer" value={value.paidBy} onChange={(e) => set({ paidBy: e.target.value })}>
            {group?.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Segmented
        label="Split method"
        value={value.method}
        onChange={(method) => set({ method, values: {} })}
        options={[
          { value: "equal", label: "Equally" },
          { value: "exact", label: "Exact" },
          { value: "percent", label: "Percent" },
        ]}
      />
      <ul className="flex flex-col gap-2">
        {group?.members.map((m) => {
          const on = value.included.includes(m.id);
          return (
            <li key={m.id} className="flex items-center gap-3">
              <label className="flex flex-1 items-center gap-2.5 text-[15px]">
                <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={on} onChange={() => toggle(m.id)} />
                {m.name}
              </label>
              {on && value.method !== "equal" ? (
                <div className="relative w-28">
                  <Input
                    inputMode="decimal"
                    value={value.values[m.id] ?? ""}
                    onChange={(e) => set({ values: { ...value.values, [m.id]: e.target.value } })}
                    aria-label={`${m.name}'s ${value.method === "percent" ? "percentage" : "amount"}`}
                    className="h-10 pr-7 text-right"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">{value.method === "percent" ? "%" : ""}</span>
                </div>
              ) : (
                <span className={cn("tabular text-sm font-medium", !on && "text-muted")}>{on && shareOf(m.id) != null ? money(shareOf(m.id)!) : "—"}</span>
              )}
            </li>
          );
        })}
      </ul>
      {result?.error && (
        <p className="text-[13px] text-danger" role="alert">
          {result.error}
        </p>
      )}
    </div>
  );
}
