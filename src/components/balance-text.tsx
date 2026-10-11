"use client";

import { useMoney } from "@/lib/hooks";
import { cn } from "./ui";

export function BalanceText({ amount, className }: { amount: number; className?: string }) {
  const money = useMoney();
  if (amount === 0) return <span className={cn("text-muted", className)}>All settled</span>;
  return amount > 0 ? <span className={cn("font-semibold text-success", className)}>You are owed {money(amount)}</span> : <span className={cn("font-semibold text-danger", className)}>You owe {money(-amount)}</span>;
}
