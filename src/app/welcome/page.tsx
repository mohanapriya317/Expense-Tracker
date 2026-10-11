"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CategoryIcon } from "@/components/category";
import { Button, Field, Select, cn } from "@/components/ui";
import { api } from "@/lib/api";
import { DEFAULT_CATEGORIES } from "@/lib/categories";
import { parseAmountInput } from "@/lib/format";
import { useMe } from "@/lib/hooks";
import { CURRENCIES, currencySymbol } from "@/lib/money";

const PRESELECTED = ["food", "groceries", "fuel", "transport", "bills", "rent", "shopping"];

/** Three quick steps: currency and month start, categories, an optional budget. Everything is skippable. */
export default function WelcomePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const [step, setStep] = useState(0);
  const [currency, setCurrency] = useState("INR");
  const [startDay, setStartDay] = useState(1);
  const [picked, setPicked] = useState<string[]>(PRESELECTED);
  const [budget, setBudget] = useState("");

  useEffect(() => {
    if (me.data?.user.onboarded) router.replace("/");
  }, [me.data, router]);

  const finish = useMutation({
    mutationFn: (skip: boolean) =>
      api.post("/api/me/onboarding", {
        currency,
        monthStartDay: startDay,
        categoryKeys: skip ? DEFAULT_CATEGORIES.map((c) => c.key) : picked,
        overallBudget: skip ? null : parseAmountInput(budget),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries();
      router.replace("/");
      toast.success("You're all set. Press + to log your first expense.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const steps = ["Your month", "Categories", "Budget"];

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 py-8">
      <div className="flex items-center justify-between">
        <ol className="flex gap-1.5" aria-label={`Step ${step + 1} of 3`}>
          {steps.map((s, i) => (
            <li key={s} className={cn("h-1.5 w-8 rounded-full", i <= step ? "bg-primary" : "bg-line")} />
          ))}
        </ol>
        <button type="button" onClick={() => finish.mutate(true)} className="h-11 text-sm font-medium text-muted hover:text-fg">
          Skip
        </button>
      </div>

      <div className="mt-6 flex flex-1 flex-col gap-6">
        {step === 0 && (
          <>
            <div>
              <h1 className="text-[26px] font-bold tracking-tight">Hi {me.data?.user.name ?? "there"}, let&apos;s set up your month</h1>
              <p className="mt-1 text-[15px] text-muted">You can change any of this later in Settings.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Currency" htmlFor="currency">
                <Select id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {Object.entries(CURRENCIES).map(([code, c]) => (
                    <option key={code} value={code}>
                      {c.symbol} {code}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Month starts on" htmlFor="start" hint="Pick your salary day if you budget by pay cycle.">
                <Select id="start" value={startDay} onChange={(e) => setStartDay(Number(e.target.value))}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d === 1 ? "1st (calendar month)" : `${d}${d === 2 || d === 22 ? "nd" : d === 3 || d === 23 ? "rd" : d === 21 ? "st" : "th"}`}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div>
              <h1 className="text-[26px] font-bold tracking-tight">What do you spend on most?</h1>
              <p className="mt-1 text-[15px] text-muted">We&apos;ll show these first. You can add your own later.</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {DEFAULT_CATEGORIES.filter((c) => c.key !== "other").map((c) => {
                const on = picked.includes(c.key);
                return (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(c.key)}
                    className={cn("relative flex h-14 items-center gap-2.5 rounded-xl border px-3 text-left text-[15px] font-medium transition-colors", on ? "border-primary bg-primary-soft" : "border-line bg-surface hover:bg-surface-muted")}
                  >
                    <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                    {c.name}
                    {on && <Check className="absolute right-2.5 size-4 text-primary" />}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <h1 className="text-[26px] font-bold tracking-tight">Set a monthly budget</h1>
              <p className="mt-1 text-[15px] text-muted">Optional. We&apos;ll warn you at 80% and when you go over.</p>
            </div>
            <Field label="Overall monthly budget" htmlFor="budget">
              <div className="flex h-14 items-center gap-2 rounded-xl border border-line bg-surface px-4 focus-within:border-primary">
                <span className="text-xl text-muted">{currencySymbol(currency)}</span>
                <input id="budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="25,000" className="tabular w-full bg-transparent text-xl font-semibold outline-none" />
              </div>
            </Field>
            <div className="flex flex-wrap gap-2">
              {[15000, 25000, 40000, 60000].map((v) => (
                <button key={v} type="button" onClick={() => setBudget(String(v))} className="h-10 rounded-full border border-line px-3.5 text-sm hover:bg-surface-muted">
                  {currencySymbol(currency)}
                  {v.toLocaleString("en-IN")}
                </button>
              ))}
            </div>
            <p className="text-sm text-muted">You can add budgets per category from the Budgets screen.</p>
          </>
        )}
      </div>

      <div className="mt-8 grid grid-cols-[1fr_2fr] gap-3">
        <Button variant="secondary" size="lg" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          Back
        </Button>
        {step < 2 ? (
          <Button size="lg" onClick={() => setStep((s) => s + 1)} disabled={step === 1 && picked.length === 0}>
            Continue
          </Button>
        ) : (
          <Button size="lg" onClick={() => finish.mutate(false)} loading={finish.isPending}>
            {budget ? "Finish" : "Finish without a budget"}
          </Button>
        )}
      </div>
    </div>
  );
}
