"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Download, LogOut, Monitor, Moon, Sun, Tags, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button, Card, CardHeader, ConfirmDialog, Field, Input, PageHeader, Segmented, Select, Skeleton, Switch, buttonClass } from "@/components/ui";
import { api, hardNavigate } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import { CURRENCIES } from "@/lib/money";
import type { Me } from "@/lib/types";

type Theme = "light" | "dark" | "system";

function applyTheme(t: Theme) {
  try {
    if (t === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", t);
  } catch {}
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export default function SettingsPage() {
  const me = useMe();
  const qc = useQueryClient();
  const user = me.data?.user;
  const [nameDraft, setName] = useState<string | null>(null);
  const name = nameDraft ?? user?.name ?? "";
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (typeof window !== "undefined" && (localStorage.getItem("theme") as Theme)) || "system";
    } catch {
      return "system";
    }
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState("");

  const update = useMutation({
    mutationFn: (patch: Partial<Me>) => api.patch<{ user: Me }>("/api/me", patch),
    onSuccess: ({ user }) => {
      qc.setQueryData(["me"], (old: { user: Me; unreadNotifications: number } | undefined) => (old ? { ...old, user } : old));
      qc.invalidateQueries();
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => api.del("/api/me"),
    onSuccess: () => {
      qc.clear();
      hardNavigate("/signup");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const signOut = async () => {
    await api.post("/api/auth/logout").catch(() => undefined);
    qc.clear();
    hardNavigate("/login");
  };

  if (!user) return <Skeleton className="h-96" />;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageHeader title="Settings" subtitle={user.email} />

      <Card className="flex flex-col gap-4 p-5">
        <CardHeader title="Profile" />
        <div className="flex items-end gap-2">
          <Field label="Name" htmlFor="s-name" className="flex-1">
            <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button variant="secondary" onClick={() => update.mutate({ name })} disabled={!name.trim() || name === user.name}>
            Save
          </Button>
        </div>
        {user.isDemo && <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning-ink">This is the shared demo account. Its data is reset each time someone signs in with “Try the demo account”.</p>}
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <CardHeader title="Money and months" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Currency" htmlFor="s-currency">
            <Select id="s-currency" value={user.currency} onChange={(e) => update.mutate({ currency: e.target.value })}>
              {Object.entries(CURRENCIES).map(([code, c]) => (
                <option key={code} value={code}>
                  {c.symbol} {code}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Month starts on day" htmlFor="s-start" hint="Budgets and reports follow this cycle.">
            <Select id="s-start" value={user.monthStartDay} onChange={(e) => update.mutate({ monthStartDay: Number(e.target.value) })}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => update.mutate({ tzOffset: -new Date().getTimezoneOffset(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })}
        >
          Use this device&apos;s timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone})
        </Button>
      </Card>

      <Link href="/settings/categories" className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-5 hover:bg-surface-muted/60">
        <Tags className="size-5 text-primary" />
        <span className="flex-1">
          <span className="block font-semibold">Categories and rules</span>
          <span className="block text-sm text-muted">Add, rename or recolour categories; manage learned merchant rules.</span>
        </span>
        <ChevronRight className="size-5 text-muted" />
      </Link>

      <Card className="flex flex-col gap-1 p-5">
        <CardHeader title="Notifications" subtitle="Budget alerts at the thresholds you set on each budget." />
        <Switch checked={user.notificationPrefs.inApp} onChange={(v) => update.mutate({ notificationPrefs: { ...user.notificationPrefs, inApp: v } })} label="In the app" />
        <Switch checked={user.notificationPrefs.email} onChange={(v) => update.mutate({ notificationPrefs: { ...user.notificationPrefs, email: v } })} label="Email" description={`To ${user.email}`} />
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <CardHeader title="Appearance" />
        <Segmented
          label="Theme"
          value={theme}
          onChange={(t) => {
            setTheme(t);
            applyTheme(t);
          }}
          options={[
            { value: "light", label: <span className="flex items-center gap-1.5"><Sun className="size-4" /> Light</span> },
            { value: "dark", label: <span className="flex items-center gap-1.5"><Moon className="size-4" /> Dark</span> },
            { value: "system", label: <span className="flex items-center gap-1.5"><Monitor className="size-4" /> System</span> },
          ]}
        />
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <CardHeader title="Your data" subtitle="Download everything, or delete your account." />
        <div className="flex flex-wrap gap-2">
          <a href="/api/me/export?format=json" className={buttonClass("secondary", "sm")}>
            <Download className="size-4" /> Export all (JSON)
          </a>
          <a href="/api/me/export?format=csv" className={buttonClass("secondary", "sm")}>
            <Download className="size-4" /> Expenses (CSV)
          </a>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 border-t border-line pt-4">
          <Button variant="secondary" size="sm" onClick={signOut}>
            <LogOut className="size-4" /> Sign out
          </Button>
          <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" /> Delete account
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => {
          setConfirmDelete(false);
          setDeleteText("");
        }}
        onConfirm={() => (deleteText === "DELETE" ? remove.mutate() : toast.error("Type DELETE to confirm."))}
        loading={remove.isPending}
        title="Delete your account?"
        confirmLabel="Delete forever"
        body={
          <div className="flex flex-col gap-3">
            <p>This permanently deletes your expenses, receipts, budgets, groups and settings. Export your data first if you want a copy.</p>
            <Field label="Type DELETE to confirm" htmlFor="del-confirm">
              <Input id="del-confirm" value={deleteText} onChange={(e) => setDeleteText(e.target.value)} autoComplete="off" />
            </Field>
          </div>
        }
      />
    </div>
  );
}
