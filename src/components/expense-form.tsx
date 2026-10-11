"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Confidence } from "@/lib/parser";
import { currencySymbol } from "@/lib/money";
import { fromLocalInput, minorToInput, parseAmountInput, shortDate, toLocalInput } from "@/lib/format";
import { useCategories, useMe, useMoney } from "@/lib/hooks";
import type { Expense } from "@/lib/types";
import { CategoryChip } from "./category";
import { SplitEditor, computeShares, type SplitDraft, type SplitPayload } from "./split-editor";
import { Button, ConfidenceDot, Field, Input, Segmented, Switch, Textarea, cn } from "./ui";

export interface ExpenseDraft {
  amount: number | null;
  categoryId: string | null;
  merchant: string;
  note: string;
  occurredAt: string; // ISO
  paymentMethod: "UPI" | "Cash" | "Card" | "Other" | null;
  receiptId?: string | null;
  confidence?: Partial<Record<"amount" | "category" | "merchant" | "date", Confidence>>;
  splitWith?: string[];
  split?: SplitDraft | null;
}

export interface ExpenseSubmit {
  amount: number;
  categoryId: string;
  merchant: string;
  note: string;
  occurredAt: string;
  paymentMethod: "UPI" | "Cash" | "Card" | "Other" | null;
  split: SplitPayload | null;
}

export function draftFromExpense(e: Expense): ExpenseDraft {
  return {
    amount: e.amount,
    categoryId: e.categoryId,
    merchant: e.merchant,
    note: e.note,
    occurredAt: e.occurredAt,
    paymentMethod: e.paymentMethod,
    receiptId: e.receiptId,
    split: e.split?.groupId
      ? {
          groupId: e.split.groupId,
          paidBy: e.split.paidBy,
          method: e.split.method,
          included: e.split.shares.map((s) => s.memberId),
          values: Object.fromEntries(e.split.shares.map((s) => [s.memberId, e.split!.method === "exact" ? String(s.amount / 100) : e.split!.method === "percent" ? String(Math.round((s.amount / e.amount) * 1000) / 10) : ""])),
        }
      : null,
  };
}

export function DuplicateBanner({ expense, kind, onDismiss }: { expense: Expense; kind?: "exact" | "similar" | "recent"; onDismiss?: () => void }) {
  const money = useMoney();
  const what = kind === "exact" ? "You've uploaded this receipt before" : kind === "recent" ? "You just logged something similar" : "Possible duplicate";
  return (
    <div role="alert" className="flex gap-3 rounded-xl border border-warning/40 bg-warning-soft p-3 text-warning-ink">
      <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="flex-1 text-sm">
        <p>
          <strong>{what}.</strong> {money(expense.amount)} {expense.title ? `at ${expense.title}` : ""} on {shortDate(expense.occurredAt)}.
        </p>
        <div className="mt-1.5 flex gap-4 font-semibold">
          <Link href={`/activity/${expense.id}`} className="underline-offset-2 hover:underline">
            View it
          </Link>
          {onDismiss && (
            <button type="button" onClick={onDismiss} className="underline-offset-2 hover:underline">
              Save anyway
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ExpenseForm({
  initial,
  onSubmit,
  submitting,
  submitLabel = "Save expense",
  secondary,
  autoFocusAmount,
  showConfidence = true,
  formId = "expense-form",
  hideActions,
}: {
  initial: ExpenseDraft;
  onSubmit: (v: ExpenseSubmit) => void;
  submitting?: boolean;
  submitLabel?: string;
  secondary?: React.ReactNode;
  autoFocusAmount?: boolean;
  showConfidence?: boolean;
  formId?: string;
  hideActions?: boolean;
}) {
  const { data: me } = useMe();
  const categories = useCategories();
  const [amount, setAmount] = useState(minorToInput(initial.amount));
  const [pickedCategory, setCategoryId] = useState(initial.categoryId);
  // Default to Other when the parser found no category.
  const categoryId = pickedCategory ?? (categories.data?.find((c) => c.name === "Other") ?? categories.data?.[0])?.id ?? null;
  const [maxDate] = useState(() => toLocalInput(new Date(Date.now() + 86_400_000)));
  const [merchant, setMerchant] = useState(initial.merchant);
  const [note, setNote] = useState(initial.note);
  const [when, setWhen] = useState(toLocalInput(initial.occurredAt));
  const [pay, setPay] = useState(initial.paymentMethod ?? "Other");
  const [splitOn, setSplitOn] = useState(!!initial.split || !!initial.splitWith?.length);
  const [split, setSplit] = useState<SplitDraft | null>(initial.split ?? null);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocusAmount) amountRef.current?.focus();
  }, [autoFocusAmount]);

  const mark = (f: string) => setTouched((t) => new Set(t).add(f));
  const conf = (f: "amount" | "category" | "merchant" | "date") => (showConfidence && !touched.has(f) ? initial.confidence?.[f] : undefined);
  const amountMinor = parseAmountInput(amount);

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const errs: Record<string, string> = {};
    if (!amountMinor) errs.amount = "Enter an amount above zero.";
    if (!categoryId) errs.category = "Pick a category.";
    if (!when || Number.isNaN(new Date(when).getTime())) errs.date = "Pick a date.";
    let splitPayload: SplitPayload | null = null;
    if (splitOn) {
      if (!split) errs.split = "Pick a group to split with.";
      else {
        const r = computeShares(amountMinor, split);
        if (r.error || !r.shares) errs.split = r.error ?? "Check the split.";
        else splitPayload = { groupId: split.groupId, paidBy: split.paidBy, method: split.method, shares: r.shares };
      }
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    onSubmit({ amount: amountMinor!, categoryId: categoryId!, merchant: merchant.trim(), note: note.trim(), occurredAt: fromLocalInput(when), paymentMethod: pay === "Other" ? null : pay, split: splitPayload });
  };

  const symbol = currencySymbol(me?.user.currency);

  return (
    <form id={formId} onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <div className="flex items-end gap-4">
        {initial.receiptId && (
          <a href={`/api/receipts/${initial.receiptId}`} target="_blank" rel="noreferrer" className="shrink-0" title="Open receipt">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/receipts/${initial.receiptId}`} alt="Receipt" className="h-20 w-16 rounded-lg border border-line bg-surface-muted object-cover" />
          </a>
        )}
        <div className="flex-1">
          <label htmlFor={`${formId}-amount`} className="flex items-center gap-1.5 text-[13px] font-medium text-muted">
            Amount <ConfidenceDot level={conf("amount")} />
          </label>
          <div className="flex items-baseline gap-1 border-b-2 border-line focus-within:border-primary">
            <span className="text-2xl font-semibold text-muted">{symbol}</span>
            <input
              ref={amountRef}
              id={`${formId}-amount`}
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                mark("amount");
              }}
              placeholder="0"
              aria-invalid={!!errors.amount || undefined}
              className="tabular w-full bg-transparent py-1 text-4xl font-bold tracking-tight outline-none placeholder:text-muted/40"
            />
          </div>
          {errors.amount && <p className="mt-1 text-[13px] text-danger">{errors.amount}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-muted" id={`${formId}-cat-label`}>
          Category <ConfidenceDot level={conf("category")} />
        </span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={`${formId}-cat-label`}>
          {categories.data?.map((c) => (
            <CategoryChip
              key={c.id}
              name={c.name}
              icon={c.icon}
              color={c.color}
              selected={c.id === categoryId}
              onClick={() => {
                setCategoryId(c.id);
                mark("category");
              }}
            />
          ))}
        </div>
        {errors.category && <p className="text-[13px] text-danger">{errors.category}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={<span className="flex items-center gap-1.5">Merchant <ConfidenceDot level={conf("merchant")} /></span>} htmlFor={`${formId}-merchant`}>
          <Input
            id={`${formId}-merchant`}
            value={merchant}
            onChange={(e) => {
              setMerchant(e.target.value);
              mark("merchant");
            }}
            placeholder="e.g. Shell"
            autoComplete="off"
          />
        </Field>
        <Field label={<span className="flex items-center gap-1.5">Date and time <ConfidenceDot level={conf("date")} /></span>} htmlFor={`${formId}-date`} error={errors.date}>
          <Input
            id={`${formId}-date`}
            type="datetime-local"
            value={when}
            max={maxDate}
            onChange={(e) => {
              setWhen(e.target.value);
              mark("date");
            }}
            className={cn(conf("date") === "low" && "border-warning bg-warning-soft/40")}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-muted">Paid with</span>
        <Segmented
          label="Payment method"
          value={pay}
          onChange={setPay}
          options={[
            { value: "UPI", label: "UPI" },
            { value: "Card", label: "Card" },
            { value: "Cash", label: "Cash" },
            { value: "Other", label: "Other" },
          ]}
        />
      </div>

      <Field label="Note" htmlFor={`${formId}-note`}>
        <Textarea id={`${formId}-note`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note" rows={2} maxLength={500} />
      </Field>

      <div className="flex flex-col gap-3">
        <Switch
          checked={splitOn}
          onChange={(v) => {
            setSplitOn(v);
            if (!v) setSplit(null);
          }}
          label="Split with others"
          description={splitOn ? "Only your share counts toward your budgets." : undefined}
        />
        {splitOn && <SplitEditor amount={amountMinor} value={split} onChange={setSplit} suggestedNames={initial.splitWith} />}
        {errors.split && !split && <p className="text-[13px] text-danger">{errors.split}</p>}
      </div>

      {!hideActions && (
        <div className="grid grid-cols-[1fr_2fr] gap-3 pt-1">
          {secondary ?? <span />}
          <Button type="submit" size="lg" loading={submitting}>
            {submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
