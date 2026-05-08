"use client";

import { useEffect, useState } from "react";
import type { Queue } from "@/lib/types";
import { Ticket, Clock, CheckCircle2, AlertCircle } from "lucide-react";

interface QueueOverlayProps {
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

export function QueueOverlay({ currentQueue, recentQueues }: QueueOverlayProps) {
  const animateKey = currentQueue?.id ?? "empty";

  return (
    <div className="w-full h-full bg-white/80 backdrop-blur-md rounded-l-3xl shadow-2xl flex flex-col overflow-hidden border-l border-slate-200">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5 flex items-center gap-4 shadow-lg">
        <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
          <Ticket className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide">
            ANTRIAN SEKARANG
          </h1>
          <p className="text-blue-200 text-sm">Nomor yang sedang dipanggil</p>
        </div>
      </div>

      {/* Current Queue Number */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        <div
          key={animateKey}
          className="animate-bounce-in"
        >
          <div className="bg-gradient-to-br from-amber-400 to-amber-500 rounded-2xl px-10 py-8 shadow-xl ring-4 ring-amber-200">
            <div className="text-[8rem] font-bold text-white leading-none text-center drop-shadow-lg">
              {currentQueue?.ticket_number ?? "-"}
            </div>
          </div>
        </div>
        
        {currentQueue ? (
          <div className="mt-6 text-center">
            <div className="inline-flex items-center gap-2 bg-slate-100 rounded-full px-5 py-2">
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              <span className="text-xl text-slate-700 font-semibold">
                {currentQueue.service_type ?? "Layanan Umum"}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2 text-slate-500">
              <Clock className="w-4 h-4" />
              <span className="text-sm">
                {currentQueue.counter?.name 
                  ? `Di-${currentQueue.counter.name}` 
                  : "Dipanggil"} {formatTimeAgo(currentQueue.called_at)}
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-6 text-center">
            <div className="inline-flex items-center gap-2 bg-slate-100 rounded-full px-5 py-2">
              <AlertCircle className="w-5 h-5 text-slate-400" />
              <span className="text-lg text-slate-500 font-medium">
                Menunggu antrian...
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Previous Queues */}
      <div className="border-t border-slate-200 px-6 py-5 bg-slate-50/50">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-slate-700">RIWAYAT</h2>
        </div>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {recentQueues.slice(0, 5).map((queue) => (
            <div
              key={queue.id}
              className="flex items-center justify-between bg-white rounded-xl px-4 py-3 shadow-sm border border-slate-100 hover:border-emerald-200 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl font-bold text-slate-700">
                  {queue.ticket_number}
                </span>
                <span className="text-sm text-slate-500">
                  {queue.service_type ?? ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {queue.counter && (
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">
                    {queue.counter.name}
                  </span>
                )}
                <span className="text-xs text-emerald-600 font-medium">
                  ✓ {formatTimeAgo(queue.completed_at ?? queue.called_at)}
                </span>
              </div>
            </div>
          ))}
          {recentQueues.length === 0 && (
            <div className="text-center text-slate-400 py-4 text-sm">
              Belum ada riwayat antrian
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="bg-slate-800 px-6 py-4">
        <SlotTime />
      </div>
    </div>
  );
}

function SlotTime() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const dateStr = time.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const timeStr = time.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-white">
        <span className="text-sm text-slate-400">📅</span>
        <span className="text-sm">{dateStr}</span>
      </div>
      <div className="flex items-center gap-2 text-white">
        <span className="text-lg font-mono font-bold tracking-wider" suppressHydrationWarning>{timeStr}</span>
      </div>
    </div>
  );
}