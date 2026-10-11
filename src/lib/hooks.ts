"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { api } from "./api";
import { formatMoney } from "./money";
import type { Category, Me } from "./types";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<{ user: Me; unreadNotifications: number }>("/api/me"),
    staleTime: 30_000,
  });
}

export function useCategories(includeArchived = false) {
  return useQuery({
    queryKey: ["categories", includeArchived],
    queryFn: () => api.get<{ categories: Category[] }>(`/api/categories${includeArchived ? "?all=1" : ""}`),
    select: (d) => d.categories,
    staleTime: 60_000,
  });
}

/** Formats minor units in the signed-in user's currency. */
export function useMoney() {
  const { data } = useMe();
  const currency = data?.user.currency ?? "INR";
  return useCallback((minor: number, opts?: { compact?: boolean; decimals?: boolean }) => formatMoney(minor, currency, opts), [currency]);
}

/** Refresh everything that depends on expenses after a create, edit or delete. */
export function useInvalidateSpending() {
  const qc = useQueryClient();
  return useCallback(() => {
    for (const key of ["expenses", "expense", "dashboard", "budgets", "budget", "reports", "insights", "groups", "group", "notifications", "me", "categories"]) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  }, [qc]);
}
