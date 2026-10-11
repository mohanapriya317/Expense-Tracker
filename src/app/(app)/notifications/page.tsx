"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Bell, CircleAlert, Trash2, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, Card, EmptyState, ErrorState, IconButton, PageHeader, Skeleton, cn } from "@/components/ui";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { useInvalidateSpending } from "@/lib/hooks";
import type { AppNotification } from "@/lib/types";

export default function NotificationsPage() {
  const router = useRouter();
  const invalidate = useInvalidateSpending();
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => api.get<{ notifications: AppNotification[]; unread: number }>("/api/notifications") });
  const readAll = useMutation({ mutationFn: () => api.post("/api/notifications"), onSuccess: invalidate, onError: (e: Error) => toast.error(e.message) });
  const read = useMutation({ mutationFn: (id: string) => api.patch(`/api/notifications/${id}`, {}), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/api/notifications/${id}`), onSuccess: invalidate });

  const open = (n: AppNotification) => {
    if (!n.readAt) read.mutate(n.id);
    if (n.link) router.push(n.link);
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageHeader
        title="Notifications"
        subtitle={q.data ? (q.data.unread ? `${q.data.unread} unread` : "All caught up") : " "}
        actions={
          q.data?.unread ? (
            <Button variant="secondary" size="sm" onClick={() => readAll.mutate()} loading={readAll.isPending}>
              Mark all as read
            </Button>
          ) : null
        }
      />
      {q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <Skeleton className="h-48" />
      ) : q.data.notifications.length === 0 ? (
        <Card>
          <EmptyState icon={<Bell className="size-6" />} title="No notifications" body="Budget alerts show up here when you reach 80% or go over." />
        </Card>
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {q.data.notifications.map((n) => {
            const over = n.type === "budget-exceeded";
            return (
              <div key={n.id} className={cn("flex items-start gap-3 px-4 py-3.5", !n.readAt && "bg-primary-soft/40")}>
                <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full", over ? "bg-danger-soft text-danger" : n.type === "budget-warning" ? "bg-warning-soft text-warning" : "bg-surface-muted text-muted")}>
                  {over ? <CircleAlert className="size-5" /> : n.type === "budget-warning" ? <TriangleAlert className="size-5" /> : <Bell className="size-5" />}
                </span>
                <button type="button" onClick={() => open(n)} className="min-w-0 flex-1 text-left">
                  <p className={cn("text-[15px]", !n.readAt && "font-semibold")}>{n.title}</p>
                  {n.body && <p className="text-sm text-muted">{n.body}</p>}
                  <p className="mt-0.5 text-xs text-muted">{relativeTime(n.createdAt)}</p>
                </button>
                {!n.readAt && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                <IconButton label="Delete notification" onClick={() => remove.mutate(n.id)} className="size-9 text-muted">
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
