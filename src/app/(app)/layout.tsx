import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { Spinner } from "@/components/ui";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <Spinner className="size-8" />
        </div>
      }
    >
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
