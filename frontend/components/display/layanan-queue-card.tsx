"use client";

import type { Layanan, Queue } from "@/lib/types";
import { Ticket, Clock, CheckCircle2, AlertCircle } from "lucide-react";

interface LayananQueueCardProps {
  layanan: Layanan;
  currentQueue: Queue | null;
  recentQueues: Queue[];
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Baru saja";
  if (minutes === 1) return "1 menit lalu";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  return `${hours} jam lalu`;
}

export function LayananQueueCard({
  layanan,
  currentQueue,
  recentQueues,
}: LayananQueueCardProps) {
  const animateKey = currentQueue?.id ?? "empty";

  return (
    <div className="flex flex-col bg-white/80 backdrop-blur-md rounded-2xl shadow-xl overflow-hidden border border-slate-200">
      {/* Header with layanan name */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
          <Ticket className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-white truncate">
            {layanan.name}
          </h2>
          <p className="text-blue-200 text-xs">{layanan.code}</p>
        </div>
      </div>

      {/* Current queue number */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-4">
        <div key={animateKey} className="animate-bounce-in">
          <div className="bg-gradient-to-br from-amber-400 to-amber-500 rounded-xl px-6 py-4 shadow-lg ring-2 ring-amber-200">
            <div className="text-[4rem] font-bold text-white leading-none text-center drop-shadow-lg">
              {currentQueue?.ticket_number ?? "-"}
            </div>
          </div>
        </div>

        {currentQueue ? (
          <div className="mt-3 text-center">
            <div className="flex items-center gap-1.5 text-slate-500">
              <Clock className="w-3 h-3" />
              <span className="text-xs">
                {currentQueue.counter?.name
                  ? `Di-${currentQueue.counter.name}`
                  : "Dipanggil"}{" "}
                {formatTimeAgo(currentQueue.called_at)}
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-3 text-center">
            <div className="inline-flex items-center gap-1.5 bg-slate-100 rounded-full px-3 py-1">
              <AlertCircle className="w-3 h-3 text-slate-400" />
              <span className="text-xs text-slate-500">Menunggu...</span>
            </div>
          </div>
        )}
      </div>

      {/* Recent queues for this layanan */}
      <div className="border-t border-slate-200 px-3 py-2 bg-slate-50/50">
        <div className="flex items-center gap-1.5 mb-2">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          <span className="text-xs font-semibold text-slate-600">RIWAYAT</span>
        </div>
        <div className="space-y-1 max-h-28 overflow-y-auto">
          {recentQueues.slice(0, 4).map((queue) => (
            <div
              key={queue.id}
              className="flex items-center justify-between bg-white rounded-lg px-3 py-1.5 shadow-sm border border-slate-100"
            >
              <span className="text-sm font-bold text-slate-700">
                {queue.ticket_number}
              </span>
              <div className="flex items-center gap-1.5">
                {queue.counter && (
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">
                    {queue.counter.name}
                  </span>
                )}
                <span className="text-[10px] text-emerald-600">
                  ✓ {formatTimeAgo(queue.completed_at ?? queue.called_at)}
                </span>
              </div>
            </div>
          ))}
          {recentQueues.length === 0 && (
            <p className="text-center text-slate-400 text-xs py-2">
              Belum ada riwayat
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
