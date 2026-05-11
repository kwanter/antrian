"use client";

interface TvDebugInfo {
  ua: string;
  isTv: boolean;
  speechSynthesis: boolean;
  webSocket: boolean;
  wsConnected: boolean;
  lastSync: string | null;
  lastAnnouncement: string | null;
  lastError: string | null;
  videoErrors: string[];
  announcerBlocked: boolean;
}

export function TvDebugOverlay({ debug }: { debug: TvDebugInfo }) {
  return (
    <div
      className="fixed top-0 left-0 right-0 bg-black/90 text-green-400 z-50 p-4 font-mono text-xs overflow-auto max-h-64"
      style={{ fontSize: "11px", lineHeight: "1.6" }}
    >
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <span className="text-yellow-300 font-bold">[TV DEBUG]</span>

        <span title="User Agent">
          UA: <span className="text-white">{debug.ua.slice(0, 60)}</span>
        </span>

        <span className={debug.isTv ? "text-amber-400" : "text-green-400"}>
          TV: {debug.isTv ? "YES" : "no"}
        </span>

        <span className={debug.speechSynthesis ? "text-green-400" : "text-red-400"}>
          speech: {debug.speechSynthesis ? "yes" : "NO"}
        </span>

        <span className={debug.webSocket ? "text-green-400" : "text-red-400"}>
          WS: {debug.webSocket ? "yes" : "NO"}
        </span>

        <span className={debug.wsConnected ? "text-green-400" : "text-gray-500"}>
          WS conn: {debug.wsConnected ? "connected" : "disconnected"}
        </span>

        <span className={debug.announcerBlocked ? "text-red-400" : "text-green-400"}>
          announcer: {debug.announcerBlocked ? "blocked" : "ok"}
        </span>

        <span>
          sync: <span className="text-white">{debug.lastSync ?? "never"}</span>
        </span>

        <span>
          last announce: <span className="text-white">{debug.lastAnnouncement ?? "-"}</span>
        </span>

        <span>
          last error: <span className="text-red-300">{debug.lastError ?? "-"}</span>
        </span>
      </div>

      {debug.videoErrors.length > 0 && (
        <div className="mt-2 text-red-400">
          <span className="text-yellow-300">video errors:</span>
          {debug.videoErrors.map((e, i) => (
            <span key={i} className="block ml-2">
              {i + 1}. {e}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
