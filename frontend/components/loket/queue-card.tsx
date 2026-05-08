"use client";

import { Badge } from "@/components/ui/badge";
import type { Queue } from "@/lib/types";

interface QueueCardProps {
  queue: Queue | null;
}

const statusLabels: Record<string, string> = {
  waiting: "Menunggu",
  called: "Dipanggil",
  serving: "Dilayani",
  completed: "Selesai",
  skipped: "Dilewati",
};

const statusColors: Record<string, string> = {
  waiting: "bg-yellow-100 text-yellow-800",
  called: "bg-blue-100 text-blue-800",
  serving: "bg-green-100 text-green-800",
  completed: "bg-slate-100 text-slate-600",
  skipped: "bg-gray-100 text-gray-600",
};

export function QueueCard({ queue }: QueueCardProps) {
  if (!queue) {
    return (
      <div className="py-12 text-center">
        <p className="text-2xl text-slate-400 font-medium">Tekan Panggil</p>
        <p className="text-sm text-slate-400 mt-2">Tidak ada antrian aktif</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-6xl font-bold text-slate-900">
        {queue.ticket_number}
      </div>
      <p className="text-lg text-slate-600">{queue.service_type}</p>
      <Badge className={statusColors[queue.status] ?? "bg-gray-100 text-gray-600"}>
        {statusLabels[queue.status] ?? queue.status}
      </Badge>
    </div>
  );
}