"use client";

import { useEffect, useState } from "react";

export function SlotTime() {
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
