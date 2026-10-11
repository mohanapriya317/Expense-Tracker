"use client";

import Link from "next/link";
import { dayLabel, timeLabel } from "@/lib/format";
import { useMoney } from "@/lib/hooks";
import type { Expense } from "@/lib/types";
import { CategoryIcon } from "./category";
import { Badge, cn } from "./ui";

const SOURCE_LABEL: Record<string, string> = { text: "text", voice: "voice", receipt: "receipt", manual: "", import: "import", demo: "" };

export function ExpenseRow({ e, showDate, href, onClick, selected, selectable, onSelect }: {
  e: Expense;
  showDate?: boolean;
  href?: string;
  onClick?: () => void;
  selected?: boolean;
  selectable?: boolean;
  onSelect?: (v: boolean) => void;
}) {
  const money = useMoney();
  const meta = [e.category?.name, showDate ? dayLabel(e.occurredAt) : null, timeLabel(e.occurredAt)].filter(Boolean).join(" · ");
  const body = (
    <>
      <CategoryIcon icon={e.category?.icon} color={e.category?.color} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium">{e.title}</p>
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
          <span>{meta}</span>
          {SOURCE_LABEL[e.source] && <Badge>{SOURCE_LABEL[e.source]}</Badge>}
          {e.split && <Badge tone="success">split</Badge>}
        </p>
      </div>
      <div className="text-right">
        <p className="tabular text-[15px] font-semibold">{money(e.myShare)}</p>
        {e.split && e.amount !== e.myShare && <p className="tabular text-xs text-muted">of {money(e.amount)}</p>}
      </div>
    </>
  );
  const cls = cn("flex min-h-16 flex-1 items-center gap-3 py-3 text-left", (href || onClick) && "cursor-pointer");
  return (
    <div className={cn("flex items-center gap-3 px-4 transition-colors hover:bg-surface-muted/60 sm:px-5", selected && "bg-primary-soft/60")}>
      {selectable && (
        <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={!!selected} onChange={(ev) => onSelect?.(ev.target.checked)} aria-label={`Select ${e.title}`} />
      )}
      {href ? (
        <Link href={href} className={cls}>
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={cls}>
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </div>
  );
}
