"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import type { Queue } from "@/lib/types";

interface ServiceHistoryProps {
  queues: Queue[];
}

function formatTime(dateString: string | null | undefined): string {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export function ServiceHistory({ queues }: ServiceHistoryProps) {
  // Filter to only completed or skipped queues from today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const history = queues
    .filter((q) => q.status === "completed" || q.status === "skipped")
    .filter((q) => {
      if (!q.completed_at) return false;
      const completedDate = new Date(q.completed_at);
      completedDate.setHours(0, 0, 0, 0);
      return completedDate.getTime() === today.getTime();
    })
    .sort((a, b) => {
      const dateA = new Date(a.completed_at ?? 0).getTime();
      const dateB = new Date(b.completed_at ?? 0).getTime();
      return dateB - dateA;
    });

  if (history.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-slate-500 text-sm">
          Belum ada antrian yang diselesaikan hari ini
        </CardContent>
      </Card>
    );
  }

  return (
    <ScrollArea className="h-[300px] rounded-md border">
      <div className="p-4 space-y-2">
        {history.map((queue) => (
          <div
            key={queue.id}
            className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0"
          >
            <div className="flex items-center gap-3">
              <span className="font-bold text-slate-900 text-lg">{queue.ticket_number}</span>
              <span className="text-sm text-slate-600">{queue.service_type}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">
                {queue.status === "completed" ? "Selesai" : "Dilewati"}
              </span>
              <span className="text-sm text-slate-500">
                {formatTime(queue.completed_at)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}