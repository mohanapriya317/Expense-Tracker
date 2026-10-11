"use client";

import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { Download, List as ListIcon, Search, SlidersHorizontal, Upload, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CategoryChip } from "@/components/category";
import { ExpenseDetail } from "@/components/expense-detail";
import { ExpenseRow } from "@/components/expense-row";
import { MonthSwitcher, useCurrentMonthKey } from "@/components/month-switcher";
import { useQuickAdd } from "@/components/quick-add";
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, IconButton, Input, PageHeader, Select, Sheet, Skeleton, cn } from "@/components/ui";
import { api, qs } from "@/lib/api";
import { dayLabel } from "@/lib/format";
import { useCategories, useInvalidateSpending, useMoney } from "@/lib/hooks";
import { monthLabel } from "@/lib/period";
import type { Expense, ExpenseList } from "@/lib/types";

const SOURCES = [
  { value: "text", label: "Typed" },
  { value: "voice", label: "Voice" },
  { value: "receipt", label: "Receipt" },
  { value: "manual", label: "Manual" },
  { value: "import", label: "Imported" },
];

function useIsDesktop() {
  const [v, setV] = useState(false);
  useEffect(() => {
    const m = matchMedia("(min-width: 1024px)");
    const on = () => setV(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return v;
}

export default function ActivityPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const current = useCurrentMonthKey();
  const money = useMoney();
  const categories = useCategories();
  const invalidate = useInvalidateSpending();
  const quickAdd = useQuickAdd();
  const desktop = useIsDesktop();

  const month = params.get("month") || (params.get("all") ? "" : current);
  const category = params.getAll("category");
  const source = params.getAll("source");
  const qParam = params.get("q") ?? "";
  const min = params.get("min") ?? "";
  const max = params.get("max") ?? "";
  const sort = params.get("sort") ?? "date";
  const dir = params.get("dir") ?? "desc";

  const [search, setSearch] = useState(qParam);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [bulkCategory, setBulkCategory] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const setParams = (patch: Record<string, string | string[] | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      p.delete(k);
      if (Array.isArray(v)) v.forEach((x) => p.append(k, x));
      else if (v) p.set(k, v);
    }
    router.replace(`${pathname}${p.toString() ? `?${p}` : ""}`, { scroll: false });
  };

  // Debounced search box → URL
  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== qParam) setParams({ q: search || null });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const filterKey = { month, category, source, q: qParam, min, max, sort, dir };
  const list = useInfiniteQuery({
    queryKey: ["expenses", "list", filterKey],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.get<ExpenseList>(`/api/expenses${qs({ month: month || null, category, source, q: qParam, min, max, sort, dir, page: pageParam, limit: 50 })}`),
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
  });

  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;
  const sum = list.data?.pages[0]?.sum ?? 0;

  const groups = (() => {
    if (sort !== "date") return [{ label: "", total: 0, items }];
    const out: { label: string; total: number; items: Expense[] }[] = [];
    for (const e of items) {
      const label = dayLabel(e.occurredAt);
      const last = out[out.length - 1];
      if (last && last.label === label) {
        last.items.push(e);
        last.total += e.myShare;
      } else out.push({ label, total: e.myShare, items: [e] });
    }
    return out;
  })();

  const bulk = useMutation({
    mutationFn: (body: { action: "delete" | "category"; categoryId?: string }) => api.post<{ affected: number }>("/api/expenses/bulk", { ids: [...selected], ...body }),
    onSuccess: (r, body) => {
      invalidate();
      toast.success(body.action === "delete" ? `Deleted ${r.affected} expenses` : `Moved ${r.affected} expenses`);
      setSelected(new Set());
      setSelecting(false);
      setConfirmBulk(false);
      setBulkCategory("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importCsv = useMutation({
    mutationFn: (file: File) => {
      const f = new FormData();
      f.append("file", file);
      return api.upload<{ imported: number; skipped: number; errors: string[] }>("/api/expenses/import", f);
    },
    onSuccess: (r) => {
      invalidate();
      toast.success(`Imported ${r.imported} expenses${r.skipped ? `, skipped ${r.skipped}` : ""}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeFilters = category.length + source.length + (min || max ? 1 : 0);
  const selectedSum = items.filter((e) => selected.has(e.id)).reduce((s, e) => s + e.myShare, 0);
  const open = (e: Expense) => (desktop ? setOpenId(e.id) : router.push(`/activity/${e.id}`));

  const toggleSelect = (id: string, v: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (v) n.add(id);
      else n.delete(id);
      return n;
    });

  return (
    <div className="flex gap-6">
      <div className="min-w-0 flex-1">
        <PageHeader
          title="Activity"
          subtitle={list.data ? `${total} expenses · ${money(sum)}${month ? ` in ${monthLabel(month)}` : ""}` : " "}
          actions={
            <>
              <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} loading={importCsv.isPending}>
                <Upload className="size-4" /> Import CSV
              </Button>
              <a href="/api/me/export?format=csv" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm font-semibold hover:bg-surface-muted">
                <Download className="size-4" /> Export
              </a>
              <Button
                variant={selecting ? "soft" : "ghost"}
                size="sm"
                onClick={() => {
                  setSelecting((v) => !v);
                  setSelected(new Set());
                }}
              >
                {selecting ? "Done" : "Select"}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importCsv.mutate(f);
                  e.target.value = "";
                }}
              />
            </>
          }
        />

        <div className="sticky top-16 z-10 -mx-4 mb-4 flex flex-col gap-3 bg-bg/95 px-4 py-2 backdrop-blur md:-mx-6 md:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-muted focus-within:border-primary sm:min-w-64">
              <Search className="size-4 shrink-0" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search merchant, note, amount" aria-label="Search transactions" className="min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none" />
              {search && (
                <button type="button" onClick={() => setSearch("")} aria-label="Clear search">
                  <X className="size-4" />
                </button>
              )}
            </label>
            <Button variant={activeFilters ? "soft" : "secondary"} onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal className="size-4" /> Filters{activeFilters ? ` (${activeFilters})` : ""}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {month ? (
              <MonthSwitcher value={month} onChange={(k) => setParams({ month: k, all: null })} />
            ) : (
              <Button variant="soft" size="sm" onClick={() => setParams({ all: null, month: current })}>
                All time <X className="size-3.5" />
              </Button>
            )}
            {month && (
              <Button variant="ghost" size="sm" onClick={() => setParams({ month: null, all: "1" })}>
                All time
              </Button>
            )}
            <Select aria-label="Sort by" value={`${sort}:${dir}`} onChange={(e) => {
              const [s, d] = e.target.value.split(":");
              setParams({ sort: s === "date" ? null : s, dir: d === "desc" ? null : d });
            }} className="h-10 w-auto text-sm">
              <option value="date:desc">Newest first</option>
              <option value="date:asc">Oldest first</option>
              <option value="amount:desc">Highest amount</option>
              <option value="amount:asc">Lowest amount</option>
              <option value="merchant:asc">Merchant A–Z</option>
            </Select>
          </div>
        </div>

        {selecting && (
          <div className="sticky top-[10.5rem] z-10 mb-3 flex flex-wrap items-center gap-3 rounded-xl bg-fg px-4 py-2.5 text-sm text-bg shadow-lg">
            <span className="font-semibold">
              {selected.size} selected{selected.size ? ` · ${money(selectedSum)}` : ""}
            </span>
            <button type="button" className="underline-offset-2 hover:underline" onClick={() => setSelected(new Set(items.map((e) => e.id)))}>
              Select all {items.length}
            </button>
            <span className="flex-1" />
            <select aria-label="Move to category" value={bulkCategory} disabled={!selected.size} onChange={(e) => {
              setBulkCategory(e.target.value);
              if (e.target.value) bulk.mutate({ action: "category", categoryId: e.target.value });
            }} className="h-9 rounded-lg bg-bg/15 px-2 text-sm text-bg outline-none disabled:opacity-50">
              <option value="">Change category…</option>
              {categories.data?.map((c) => (
                <option key={c.id} value={c.id} className="text-fg">
                  {c.name}
                </option>
              ))}
            </select>
            <button type="button" disabled={!selected.size} onClick={() => setConfirmBulk(true)} className="h-9 rounded-lg px-2 font-semibold text-red-300 disabled:opacity-50">
              Delete
            </button>
          </div>
        )}

        {list.isError ? (
          <ErrorState onRetry={() => list.refetch()} />
        ) : list.isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <Card>
            <EmptyState
              icon={<ListIcon className="size-6" />}
              title={qParam || activeFilters ? "Nothing matches these filters" : "No expenses yet"}
              body={qParam || activeFilters ? "Try a different search or clear the filters." : "Expenses you add will show up here, grouped by day."}
              action={
                qParam || activeFilters ? (
                  <Button variant="secondary" onClick={() => { setSearch(""); setParams({ q: null, category: null, source: null, min: null, max: null }); }}>
                    Clear filters
                  </Button>
                ) : (
                  <Button onClick={() => quickAdd.open("text")}>Add expense</Button>
                )
              }
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map((g) => (
              <section key={g.label || "all"}>
                {g.label && (
                  <h2 className="flex justify-between px-1 pb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
                    <span>{g.label}</span>
                    <span className="tabular">{money(g.total)}</span>
                  </h2>
                )}
                <Card className="divide-y divide-line overflow-hidden">
                  {g.items.map((e) => (
                    <ExpenseRow
                      key={e.id}
                      e={e}
                      showDate={sort !== "date"}
                      onClick={() => (selecting ? toggleSelect(e.id, !selected.has(e.id)) : open(e))}
                      selectable={selecting}
                      selected={selected.has(e.id) || openId === e.id}
                      onSelect={(v) => toggleSelect(e.id, v)}
                    />
                  ))}
                </Card>
              </section>
            ))}
            {list.hasNextPage && (
              <Button variant="secondary" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage} className="self-center">
                Load more
              </Button>
            )}
            <p className="text-center text-xs text-muted">
              Showing {items.length} of {total}
            </p>
          </div>
        )}
      </div>

      {desktop && openId && (
        <aside className="sticky top-22 hidden h-fit max-h-[calc(100dvh-7rem)] w-[380px] shrink-0 overflow-y-auto rounded-2xl border border-line bg-surface p-5 lg:block" aria-label="Transaction detail">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Transaction</span>
            <IconButton label="Close detail" onClick={() => setOpenId(null)} className="size-9">
              <X className="size-4" />
            </IconButton>
          </div>
          <ExpenseDetail key={openId} id={openId} onDeleted={() => setOpenId(null)} />
        </aside>
      )}

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters" footer={
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setParams({ category: null, source: null, min: null, max: null })}>
            Clear all
          </Button>
          <Button onClick={() => setFiltersOpen(false)}>Show results</Button>
        </div>
      }>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-muted">Categories</span>
            <div className="flex flex-wrap gap-2">
              {categories.data?.map((c) => (
                <CategoryChip
                  key={c.id}
                  name={c.name}
                  icon={c.icon}
                  color={c.color}
                  selected={category.includes(c.id)}
                  onClick={() => setParams({ category: category.includes(c.id) ? category.filter((x) => x !== c.id) : [...category, c.id] })}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-muted">Added by</span>
            <div className="flex flex-wrap gap-2">
              {SOURCES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={source.includes(s.value)}
                  onClick={() => setParams({ source: source.includes(s.value) ? source.filter((x) => x !== s.value) : [...source, s.value] })}
                  className={cn("h-9 rounded-full border px-3 text-sm font-medium", source.includes(s.value) ? "border-primary bg-primary-soft text-primary-ink" : "border-line")}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Min amount" htmlFor="f-min">
              <Input id="f-min" inputMode="decimal" defaultValue={min} onBlur={(e) => setParams({ min: e.target.value || null })} />
            </Field>
            <Field label="Max amount" htmlFor="f-max">
              <Input id="f-max" inputMode="decimal" defaultValue={max} onBlur={(e) => setParams({ max: e.target.value || null })} />
            </Field>
          </div>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmBulk}
        onClose={() => setConfirmBulk(false)}
        onConfirm={() => bulk.mutate({ action: "delete" })}
        loading={bulk.isPending}
        title={`Delete ${selected.size} expenses?`}
        body={`${money(selectedSum)} in total. This can't be undone.`}
      />
    </div>
  );
}
