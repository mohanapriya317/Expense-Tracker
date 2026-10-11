"use client";

import { AssistantChat } from "@/components/assistant-chat";
import { Card } from "@/components/ui";

export default function AssistantPage() {
  return (
    <div className="mx-auto flex h-[calc(100dvh-13rem)] max-w-2xl flex-col md:h-[calc(100dvh-8rem)]">
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <AssistantChat />
      </Card>
    </div>
  );
}
