"use client";

import { ArrowLeft } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { ExpenseDetail } from "@/components/expense-detail";
import { Card } from "@/components/ui";

export default function ExpensePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <button type="button" onClick={() => (history.length > 1 ? router.back() : router.push("/activity"))} className="flex h-10 items-center gap-1.5 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Back
      </button>
      <Card className="p-5">
        <ExpenseDetail id={id} onDeleted={() => router.push("/activity")} />
      </Card>
    </div>
  );
}
