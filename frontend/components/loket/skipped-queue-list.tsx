"use client";

import { useState } from "react";
import type { Queue } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Phone } from "lucide-react";

interface SkippedQueueListProps {
  queues: Queue[];
  onRecall: (queueId: number) => void;
  isRecalling: boolean;
}

function formatTime(dateString: string | null | undefined): string {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function timeAgo(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const diff = Date.now() - new Date(dateString).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Baru saja";
  if (min === 1) return "1 menit lalu";
  if (min < 60) return `${min} menit lalu`;
  return `${Math.floor(min / 60)} jam lalu`;
}

export function SkippedQueueList({ queues, onRecall, isRecalling }: SkippedQueueListProps) {
  const [expanded, setExpanded] = useState(queues.length > 0);

  if (queues.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 overflow-hidden">
      {/* Header — clickable to collapse/expand */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-amber-100/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-amber-800">
            Antrian Dilewati
          </span>
          <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full bg-amber-500 text-white text-xs font-bold">
            {queues.length}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-amber-600" />
        ) : (
          <ChevronDown className="w-4 h-4 text-amber-600" />
        )}
      </button>

      {/* Queue list */}
      {expanded && (
        <ScrollArea className="max-h-[240px]">
          <div className="px-4 pb-3 space-y-2">
            {queues.map((queue) => (
              <div
                key={queue.id}
                className="flex items-center justify-between bg-white rounded-lg px-4 py-3 border border-amber-100 shadow-sm"
              >
                {/* Left: ticket info */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex flex-col items-center justify-center w-12 h-12 rounded-lg bg-amber-100 border border-amber-200 shrink-0">
                    <span className="text-lg font-bold text-amber-800 leading-none">
                      {queue.ticket_number.replace(/^[A-Z]+/, "")}
                    </span>
                    <span className="text-[10px] font-semibold text-amber-600 uppercase leading-none mt-0.5">
                      {queue.ticket_number.match(/^[A-Z]+/)?.[0] ?? ""}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 text-sm">
                      {queue.ticket_number}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {queue.service_type}
                      {queue.layanan?.name && queue.layanan.name !== queue.service_type
                        ? ` · ${queue.layanan.name}`
                        : ""}
                    </p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      Dilewati {timeAgo(queue.completed_at)} · {formatTime(queue.completed_at)}
                    </p>
                  </div>
                </div>

                {/* Right: Panggil button */}
                <Button
                  size="sm"
                  className="shrink-0 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white ml-3"
                  onClick={() => onRecall(queue.id)}
                  disabled={isRecalling}
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span className="text-xs font-semibold">Panggil</span>
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
