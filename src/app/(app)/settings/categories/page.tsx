"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { CATEGORY_ICONS, CategoryIcon } from "@/components/category";
import { Badge, Button, Card, CardHeader, ConfirmDialog, Field, IconButton, Input, PageHeader, Select, Sheet, Skeleton, cn } from "@/components/ui";
import { api } from "@/lib/api";
import { CATEGORY_COLORS, CATEGORY_ICON_NAMES } from "@/lib/categories";
import { useCategories, useInvalidateSpending } from "@/lib/hooks";
import type { Category } from "@/lib/types";

interface Rule {
  id: string;
  match: string;
  categoryId: string;
  categoryName: string;
  hits: number;
}

export default function CategoriesPage() {
  const all = useCategories(true);
  const active = useCategories();
  const invalidate = useInvalidateSpending();
  const rules = useQuery({ queryKey: ["rules"], queryFn: () => api.get<{ rules: Rule[] }>("/api/rules"), select: (d) => d.rules });
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [ruleMatch, setRuleMatch] = useState("");
  const [ruleCat, setRuleCat] = useState("");

  const del = useMutation({
    mutationFn: (c: Category) => api.del<{ movedExpenses: number }>(`/api/categories/${c.id}`),
    onSuccess: (r) => {
      invalidate();
      rules.refetch();
      toast.success(r.movedExpenses ? `Deleted. ${r.movedExpenses} expenses moved to Other.` : "Category deleted");
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const archive = useMutation({
    mutationFn: (c: Category) => api.patch(`/api/categories/${c.id}`, { archived: !c.archived }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const addRule = useMutation({
    mutationFn: () => api.post("/api/rules", { match: ruleMatch, categoryId: ruleCat }),
    onSuccess: () => {
      rules.refetch();
      setRuleMatch("");
      toast.success("Rule added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delRule = useMutation({ mutationFn: (id: string) => api.del(`/api/rules/${id}`), onSuccess: () => rules.refetch() });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageHeader
        back={
          <Link href="/settings" className="mb-2 flex h-8 items-center gap-1.5 text-sm font-medium text-muted hover:text-fg">
            <ArrowLeft className="size-4" /> Settings
          </Link>
        }
        title="Categories"
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" /> New category
          </Button>
        }
      />

      <Card className="divide-y divide-line overflow-hidden">
        {!all.data ? (
          <Skeleton className="m-4 h-40" />
        ) : (
          all.data.map((c) => (
            <div key={c.id} className={cn("flex items-center gap-3 px-4 py-3", c.archived && "opacity-60")}>
              <CategoryIcon icon={c.icon} color={c.color} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium">
                  {c.name} {c.archived && <Badge>hidden</Badge>}
                </p>
                <p className="truncate text-xs text-muted">
                  {c.expenseCount ?? 0} expenses{c.keywords.length ? ` · keywords: ${c.keywords.join(", ")}` : ""}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => archive.mutate(c)} disabled={c.name === "Other"}>
                {c.archived ? "Show" : "Hide"}
              </Button>
              <IconButton label={`Edit ${c.name}`} onClick={() => setEditing(c)} className="size-9">
                <Pencil className="size-4" />
              </IconButton>
              <IconButton label={`Delete ${c.name}`} onClick={() => setDeleting(c)} disabled={c.name === "Other"} className="size-9 text-danger">
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          ))
        )}
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <CardHeader title="Merchant rules" subtitle="When a merchant or word matches, we pick this category automatically. Rules are also learned when you correct a category." />
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (ruleMatch.trim().length < 2 || !ruleCat) return toast.error("Enter a word and pick a category.");
            addRule.mutate();
          }}
        >
          <Input value={ruleMatch} onChange={(e) => setRuleMatch(e.target.value)} placeholder="e.g. shell" aria-label="Merchant or word" className="min-w-40 flex-1" />
          <Select value={ruleCat} onChange={(e) => setRuleCat(e.target.value)} aria-label="Category" className="w-44">
            <option value="">Category…</option>
            {active.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="soft" loading={addRule.isPending}>
            Add rule
          </Button>
        </form>
        {rules.data?.length ? (
          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
            {rules.data.map((r) => (
              <li key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="font-medium">“{r.match}”</span>
                <span className="text-muted">→ {r.categoryName}</span>
                <span className="ml-auto text-xs text-muted">used {r.hits}×</span>
                <IconButton label={`Delete rule ${r.match}`} onClick={() => delRule.mutate(r.id)} className="size-8 text-muted">
                  <X className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No rules yet.</p>
        )}
      </Card>

      <CategorySheet value={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting)}
        loading={del.isPending}
        title={`Delete ${deleting?.name}?`}
        body={deleting?.expenseCount ? `Its ${deleting.expenseCount} expenses move to Other, and its budget and rules are removed.` : "This category has no expenses."}
      />
    </div>
  );
}

function CategorySheet({ value, onClose }: { value: Category | "new" | null; onClose: () => void }) {
  const invalidate = useInvalidateSpending();
  const existing = value && value !== "new" ? value : null;
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("circle-ellipsis");
  const [color, setColor] = useState(CATEGORY_COLORS[0]);
  const [keywords, setKeywords] = useState("");
  const [seed, setSeed] = useState<typeof value>(null);

  if (value !== seed) {
    setSeed(value);
    setName(existing?.name ?? "");
    setIcon(existing?.icon ?? "circle-ellipsis");
    setColor(existing?.color ?? CATEGORY_COLORS[0]);
    setKeywords(existing?.keywords.join(", ") ?? "");
  }

  const save = useMutation({
    mutationFn: () => {
      const body = { name, icon, color, keywords: keywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean) };
      if (!name.trim()) throw new Error("Enter a name.");
      return existing ? api.patch(`/api/categories/${existing.id}`, body) : api.post("/api/categories", body);
    },
    onSuccess: () => {
      invalidate();
      toast.success(existing ? "Category updated" : "Category added");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet
      open={!!value}
      onClose={onClose}
      title={existing ? `Edit ${existing.name}` : "New category"}
      footer={
        <Button className="w-full" size="lg" onClick={() => save.mutate()} loading={save.isPending}>
          {existing ? "Save" : "Add category"}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <CategoryIcon icon={icon} color={color} size="lg" />
          <Field label="Name" htmlFor="c-name" className="flex-1">
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} data-autofocus/>
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-muted">Icon</span>
          <div className="grid grid-cols-8 gap-1.5">
            {CATEGORY_ICON_NAMES.map((n) => {
              const Icon = CATEGORY_ICONS[n];
              return (
                <button key={n} type="button" aria-label={n} aria-pressed={icon === n} onClick={() => setIcon(n)} className={cn("flex size-10 items-center justify-center rounded-lg border", icon === n ? "border-primary bg-primary-soft text-primary" : "border-line")}>
                  <Icon className="size-[18px]" />
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-muted">Colour</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_COLORS.map((c) => (
              <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} className={cn("size-9 rounded-full border-2", color === c ? "border-fg" : "border-transparent")} style={{ background: c }} />
            ))}
          </div>
        </div>
        <Field label="Keywords" htmlFor="c-keys" hint="Comma-separated words that should land in this category, e.g. gym, protein.">
          <Input id="c-keys" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}

