"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { minorToInput, parseAmountInput } from "@/lib/format";
import { useCategories, useInvalidateSpending, useMe } from "@/lib/hooks";
import { currencySymbol } from "@/lib/money";
import type { BudgetItem } from "@/lib/types";
import { Button, Field, Select, Sheet, cn } from "./ui";

const THRESHOLDS = [50, 80, 90, 100];

/** Create or edit a budget. `existing` = editing; `taken` = category ids that already have one. */
interface Props {
  open: boolean;
  onClose: () => void;
  existing?: BudgetItem | null;
  taken: (string | null)[];
}

export function BudgetSheet(props: Props) {
  // Mount fresh on every open so the form starts from the right values.
  if (!props.open) return null;
  return <BudgetSheetBody key={props.existing?.id ?? "new"} {...props} />;
}

function BudgetSheetBody({ onClose, existing, taken }: Props) {
  const categories = useCategories();
  const me = useMe();
  const invalidate = useInvalidateSpending();
  const [picked, setCategoryId] = useState<string | null>(existing ? (existing.categoryId ?? "overall") : null);
  const [limit, setLimit] = useState(existing ? minorToInput(existing.limit) : "");
  const [alertAt, setAlertAt] = useState<number[]>(existing?.alertAt ?? [80, 100]);
  const [error, setError] = useState<string | null>(null);
  const firstFree = !taken.includes(null) ? "overall" : (categories.data?.find((c) => !taken.includes(c.id))?.id ?? "");
  const categoryId = picked ?? firstFree;
  const open = true;

  const save = useMutation({
    mutationFn: () => {
      const amount = parseAmountInput(limit);
      if (!amount) throw new Error("Enter a monthly limit above zero.");
      if (!alertAt.length) throw new Error("Pick at least one alert.");
      if (existing) return api.patch(`/api/budgets/${existing.id}`, { limit: amount, alertAt });
      return api.post("/api/budgets", { categoryId: categoryId === "overall" ? null : categoryId, limit: amount, alertAt });
    },
    onSuccess: () => {
      invalidate();
      toast.success(existing ? "Budget updated" : "Budget added");
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const options = [
    ...(existing?.categoryId === null || !taken.includes(null) ? [{ id: "overall", name: "Overall (all spending)" }] : []),
    ...(categories.data ?? []).filter((c) => existing?.categoryId === c.id || !taken.includes(c.id)).map((c) => ({ id: c.id, name: c.name })),
  ];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={existing ? `Edit ${existing.category?.name ?? "overall"} budget` : "New budget"}
      footer={
        <div className="grid grid-cols-[1fr_2fr] gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!categoryId}>
            {existing ? "Save" : "Add budget"}
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Budget for" htmlFor="b-cat">
          <Select id="b-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={!!existing}>
            {options.length === 0 && <option value="">Every category already has a budget</option>}
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Monthly limit" htmlFor="b-limit" error={error ?? undefined}>
          <div className="flex h-12 items-center gap-2 rounded-xl border border-line bg-surface px-3.5 focus-within:border-primary">
            <span className="text-lg text-muted">{currencySymbol(me.data?.user.currency)}</span>
            <input id="b-limit" inputMode="decimal" data-autofocusvalue={limit} onChange={(e) => setLimit(e.target.value)} placeholder="6,000" className="tabular w-full bg-transparent text-lg font-semibold outline-none" />
          </div>
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-muted">Alert me at</span>
          <div className="flex flex-wrap gap-2">
            {THRESHOLDS.map((t) => {
              const on = alertAt.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setAlertAt((a) => (on ? a.filter((x) => x !== t) : [...a, t].sort((x, y) => x - y)))}
                  className={cn("h-10 rounded-full border px-4 text-sm font-medium", on ? "border-primary bg-primary-soft text-primary-ink" : "border-line")}
                >
                  {t}%
                </button>
              );
            })}
          </div>
          <p className="text-[13px] text-muted">Alerts appear in the app and by email, once per month for each level.</p>
        </div>
      </form>
    </Sheet>
  );
}
