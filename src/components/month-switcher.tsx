"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { currentMonthKey, monthLabel, shiftMonth } from "@/lib/period";
import { useMe } from "@/lib/hooks";
import { IconButton } from "./ui";

export function useCurrentMonthKey() {
  const { data } = useMe();
  return currentMonthKey({ tzOffset: data?.user.tzOffset ?? -new Date().getTimezoneOffset(), monthStartDay: data?.user.monthStartDay ?? 1 });
}

export function MonthSwitcher({ value, onChange }: { value: string; onChange: (k: string) => void }) {
  const current = useCurrentMonthKey();
  const atCurrent = value >= current;
  return (
    <div className="inline-flex items-center rounded-xl border border-line bg-surface">
      <IconButton label="Previous month" onClick={() => onChange(shiftMonth(value, -1))} className="size-10 rounded-l-xl rounded-r-none">
        <ChevronLeft className="size-5" />
      </IconButton>
      <span className="min-w-32 px-1 text-center text-sm font-semibold tabular" aria-live="polite">
        {monthLabel(value)}
      </span>
      <IconButton label="Next month" onClick={() => onChange(shiftMonth(value, 1))} disabled={atCurrent} className="size-10 rounded-l-none rounded-r-xl">
        <ChevronRight className="size-5" />
      </IconButton>
    </div>
  );
}
