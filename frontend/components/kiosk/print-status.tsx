"use client";

import { Printer, CheckCircle, XCircle } from "lucide-react";

interface PrintStatusProps {
  status: "idle" | "printing" | "success" | "error";
  errorMessage?: string;
}

export function PrintStatus({ status, errorMessage }: PrintStatusProps) {
  if (status === "idle") {
    return null;
  }

  if (status === "printing") {
    return (
      <div className="flex flex-col items-center gap-3 text-slate-600">
        <Printer className="w-16 h-16 animate-pulse" />
        <p className="text-lg font-medium">Mencetak tiket...</p>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center gap-3 text-green-600">
        <CheckCircle className="w-16 h-16" />
        <p className="text-lg font-medium">Tiket berhasil dicetak!</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center gap-3 text-red-600">
        <XCircle className="w-16 h-16" />
        <p className="text-lg font-medium">Gagal mencetak tiket</p>
        {errorMessage && (
          <p className="text-sm text-red-500 text-center max-w-xs">
            {errorMessage}
          </p>
        )}
      </div>
    );
  }

  return null;
}