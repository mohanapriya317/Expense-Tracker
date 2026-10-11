"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  ChartColumn,
  ChartPie,
  Ellipsis,
  Gauge,
  House,
  List,
  LogOut,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, hardNavigate } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import { AssistantChat } from "./assistant-chat";
import { QuickAddProvider, useQuickAdd } from "./quick-add";
import { IconButton, Sheet, Spinner, cn } from "./ui";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const PRIMARY: NavItem[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/activity", label: "Activity", icon: List },
  { href: "/budgets", label: "Budgets", icon: ChartPie },
  { href: "/reports", label: "Reports", icon: ChartColumn },
  { href: "/splits", label: "Splits", icon: Users },
  { href: "/insights", label: "Insights", icon: Gauge },
  { href: "/assistant", label: "Assistant", icon: MessageSquare },
];

const MORE: NavItem[] = [
  { href: "/reports", label: "Reports", icon: ChartColumn },
  { href: "/splits", label: "Splits", icon: Users },
  { href: "/insights", label: "Insights", icon: Gauge },
  { href: "/assistant", label: "Assistant", icon: MessageSquare },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <QuickAddProvider>
      <Shell>{children}</Shell>
    </QuickAddProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const me = useMe();
  const quickAdd = useQuickAdd();
  const qc = useQueryClient();
  const [moreOpen, setMoreOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // First-time users go through onboarding.
  useEffect(() => {
    if (me.data && !me.data.user.onboarded && pathname !== "/welcome") router.replace("/welcome");
  }, [me.data, pathname, router]);

  // Keyboard: N = add expense, Ctrl/Cmd+K = command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      // Routes stay mounted but hidden after navigation, so a focused field there doesn't count.
      const typing = (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) && el.offsetParent !== null;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "n" && !document.querySelector("dialog[open]")) {
        e.preventDefault();
        quickAdd.open("text");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quickAdd]);

  const signOut = async () => {
    await api.post("/api/auth/logout").catch(() => undefined);
    qc.clear();
    hardNavigate("/login");
  };

  const unread = me.data?.unreadNotifications ?? 0;

  // Render the layout while the user loads (pages show their own skeletons);
  // only hold back for people who still need onboarding.
  if (me.data && !me.data.user.onboarded) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar: icon rail on tablets, full sidebar on desktop */}
      <aside className="sticky top-0 hidden h-dvh w-[76px] shrink-0 flex-col gap-4 border-r border-line bg-surface px-3 py-5 md:flex xl:w-60 xl:px-4">
        <Link href="/" className="flex items-center gap-2.5 px-1.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-fg">₹</span>
          <span className="hidden text-base leading-tight font-bold xl:inline">Smart Expense Tracker</span>
        </Link>
        <button
          type="button"
          onClick={() => quickAdd.open("text")}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-fg shadow-sm hover:bg-primary-hover"
          title="Add expense (N)"
        >
          <Plus className="size-5" />
          <span className="hidden xl:inline">Add expense</span>
          <kbd className="hidden rounded bg-white/20 px-1.5 text-[11px] xl:inline">N</kbd>
        </button>
        <nav aria-label="Primary" className="flex flex-col gap-0.5">
          {PRIMARY.map((n) => (
            <SideLink key={n.href} item={n} active={isActive(pathname, n.href)} />
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-0.5">
          <SideLink item={{ href: "/notifications", label: "Notifications", icon: Bell }} active={isActive(pathname, "/notifications")} badge={unread} />
          <SideLink item={{ href: "/settings", label: "Settings", icon: Settings }} active={isActive(pathname, "/settings")} />
          <button type="button" onClick={signOut} className="flex h-10 items-center justify-center gap-3 rounded-lg px-3 text-sm text-muted hover:bg-surface-muted hover:text-fg xl:justify-start">
            <LogOut className="size-[18px]" />
            <span className="hidden xl:inline">Sign out</span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur md:px-6">
          <Link href="/" className="flex size-9 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-fg md:hidden" aria-label="Home">
            ₹
          </Link>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-10 max-w-md flex-1 items-center gap-2 rounded-xl bg-surface-muted px-3 text-left text-sm text-muted hover:text-fg"
          >
            <Search className="size-4" />
            <span className="flex-1 truncate">Search or jump to…</span>
            <kbd className="hidden rounded border border-line px-1.5 text-[11px] sm:inline">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPanelOpen((v) => !v)}
              className={cn("hidden h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium hover:bg-surface-muted lg:flex", panelOpen && "bg-primary-soft text-primary-ink")}
              aria-pressed={panelOpen}
            >
              <MessageSquare className="size-4" /> Ask
            </button>
            <Link href="/notifications" className="relative flex size-10 items-center justify-center rounded-full hover:bg-surface-muted" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
              <Bell className="size-5" />
              {unread > 0 && <span className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
            </Link>
            <Link href="/settings" className="flex size-10 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary-ink" aria-label="Account settings">
              {me.data?.user.name.charAt(0).toUpperCase()}
            </Link>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 pb-32 pt-5 md:px-6 md:pb-12 md:pt-6">{children}</main>
          {panelOpen && (
            <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-96 shrink-0 border-l border-line bg-surface lg:block" aria-label="Assistant">
              <div className="relative h-full">
                <IconButton label="Close assistant" onClick={() => setPanelOpen(false)} className="absolute right-12 top-1 z-10 size-9">
                  <X className="size-4" />
                </IconButton>
                <AssistantChat compact />
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* Mobile: assistant button and bottom tab bar */}
      {pathname !== "/assistant" && (
        <Link
          href="/assistant"
          aria-label="Ask the assistant"
          className="fixed bottom-24 right-4 z-30 flex size-13 items-center justify-center rounded-full border border-line bg-surface text-primary shadow-lg md:hidden"
        >
          <MessageSquare className="size-5" />
        </Link>
      )}
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 grid h-[calc(4.5rem+env(safe-area-inset-bottom))] grid-cols-5 items-start border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] pt-2 md:hidden">
        <TabLink item={PRIMARY[0]} active={isActive(pathname, "/")} />
        <TabLink item={PRIMARY[1]} active={isActive(pathname, "/activity")} />
        <button
          type="button"
          onClick={() => quickAdd.open("text")}
          aria-label="Add expense"
          className="-mt-6 flex size-15 items-center justify-center justify-self-center rounded-full bg-primary text-primary-fg shadow-[0_6px_16px_rgb(79_70_229/0.35)] active:scale-95"
        >
          <Plus className="size-7" strokeWidth={2.4} />
        </button>
        <TabLink item={PRIMARY[2]} active={isActive(pathname, "/budgets")} />
        <button type="button" onClick={() => setMoreOpen(true)} className={cn("flex flex-col items-center gap-1 py-1 text-[11px] font-medium", MORE.some((m) => isActive(pathname, m.href)) ? "text-primary" : "text-muted")}>
          <span className="relative">
            <Ellipsis className="size-[22px]" />
            {unread > 0 && <span className="absolute -right-1 -top-0.5 size-2 rounded-full bg-danger" />}
          </span>
          More
        </button>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More" size="sm">
        <nav className="flex flex-col">
          {MORE.map((m) => (
            <Link key={m.href} href={m.href} onClick={() => setMoreOpen(false)} className={cn("flex h-13 items-center gap-3 rounded-xl px-2 text-[15px] font-medium hover:bg-surface-muted", isActive(pathname, m.href) && "text-primary")}>
              <m.icon className="size-5" />
              {m.label}
              {m.href === "/notifications" && unread > 0 && <span className="ml-auto rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-white">{unread}</span>}
            </Link>
          ))}
          <button type="button" onClick={signOut} className="flex h-13 items-center gap-3 rounded-xl px-2 text-[15px] font-medium text-danger hover:bg-surface-muted">
            <LogOut className="size-5" /> Sign out
          </button>
        </nav>
      </Sheet>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}

function SideLink({ item, active, badge }: { item: NavItem; active: boolean; badge?: number }) {
  return (
    <Link
      href={item.href}
      title={item.label}
      aria-current={active ? "page" : undefined}
      className={cn("relative flex h-10 items-center justify-center gap-3 rounded-lg px-3 text-sm xl:justify-start", active ? "bg-primary-soft font-semibold text-primary-ink" : "text-fg/80 hover:bg-surface-muted")}
    >
      <item.icon className="size-[18px] shrink-0" />
      <span className="hidden xl:inline">{item.label}</span>
      {!!badge && <span className="absolute right-2 top-1.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-bold text-white xl:static xl:ml-auto xl:px-1.5 xl:text-xs">{badge}</span>}
    </Link>
  );
}

function TabLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-1 py-1 text-[11px]", active ? "font-semibold text-primary" : "font-medium text-muted")}>
      <item.icon className="size-[22px]" />
      {item.label}
    </Link>
  );
}

/** Ctrl/Cmd+K: jump to any screen or start an action. Typing an expense like "chai 20" offers to add it. */
function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const quickAdd = useQuickAdd();
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);

  const actions = useMemo(() => {
    const items: { label: string; hint?: string; run: () => void }[] = [
      { label: "Add expense", hint: "N", run: () => quickAdd.open("text") },
      { label: "Add by voice", run: () => quickAdd.open("voice") },
      { label: "Enter expense manually", run: () => quickAdd.open("manual") },
      ...[...PRIMARY, ...MORE.filter((m) => !PRIMARY.some((p) => p.href === m.href)), { href: "/settings/categories", label: "Categories and rules", icon: Settings }].map((n) => ({ label: `Go to ${n.label}`, run: () => router.push(n.href) })),
    ];
    const term = q.trim().toLowerCase();
    const filtered = term ? items.filter((i) => i.label.toLowerCase().includes(term)) : items;
    if (term) filtered.push({ label: `Search activity for “${q.trim()}”`, run: () => router.push(`/activity?q=${encodeURIComponent(q.trim())}`) });
    return filtered;
  }, [q, quickAdd, router]);

  const run = (i: number) => {
    const a = actions[i];
    if (!a) return;
    onClose();
    a.run();
  };

  return (
    <Sheet open onClose={onClose} title="Search" hideTitle size="md">
      <div className="flex flex-col gap-2">
        <input
          data-autofocus          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, actions.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(index);
            }
          }}
          placeholder="Type a command or search…"
          aria-label="Command"
          className="h-12 w-full rounded-xl border border-line bg-surface px-4 text-base outline-none focus:border-primary"
        />
        <ul role="listbox" aria-label="Commands" className="flex max-h-80 flex-col overflow-y-auto">
          {actions.map((a, i) => (
            <li key={a.label} role="option" aria-selected={i === index}>
              <button
                type="button"
                onMouseEnter={() => setIndex(i)}
                onClick={() => run(i)}
                className={cn("flex h-11 w-full items-center justify-between rounded-lg px-3 text-left text-[15px]", i === index && "bg-primary-soft text-primary-ink")}
              >
                {a.label}
                {a.hint && <kbd className="rounded border border-line px-1.5 text-[11px] text-muted">{a.hint}</kbd>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}
