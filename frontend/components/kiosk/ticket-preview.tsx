"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface TicketPreviewProps {
  ticketNumber: string;
  serviceType: string;
  createdAt: string;
}

export function TicketPreview({
  ticketNumber,
  serviceType,
  createdAt,
}: TicketPreviewProps) {
  const formattedDate = new Date(createdAt).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const formattedTime = new Date(createdAt).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Card
      className={cn(
        "w-full max-w-sm mx-auto p-8",
        "border-2 border-dashed border-slate-300",
        "bg-white",
      )}
    >
      <div className="text-center space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <p className="text-sm text-slate-500">Sistem Antrian Digital</p>
          <p className="text-lg font-medium text-slate-700">{serviceType}</p>
        </div>

        {/* Divider */}
        <div className="border-t-2 border-dashed border-slate-200" />

        {/* Ticket Number */}
        <div className="space-y-2">
          <p className="text-sm text-slate-500 uppercase tracking-wider">
            Nomor Antrian
          </p>
          <p className="text-6xl font-bold text-blue-600">{ticketNumber}</p>
        </div>

        {/* Divider */}
        <div className="border-t-2 border-dashed border-slate-200" />

        {/* Footer */}
        <div className="text-sm text-slate-500 space-y-1">
          <p>{formattedDate}</p>
          <p>{formattedTime}</p>
        </div>
      </div>
    </Card>
  );
}