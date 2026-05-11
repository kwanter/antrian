"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Volume2, Play, AlertCircle, Wifi, WifiOff } from "lucide-react";
import { VideoPlayer } from "@/components/display/video-player";
import { TvVideoPlayer } from "@/components/display/tv-player";
import { TvDebugOverlay } from "@/components/display/tv-debug-overlay";
import { getLayanans } from "@/lib/api";
import api from "@/lib/api";
import type { Display, DisplaySyncEvent, Layanan, Queue, Video } from "@/lib/types";
import { useDisplayChannel } from "@/hooks/use-websocket";
import { useVolumeChannel } from "@/hooks/use-websocket";

// ─── TV detection ───────────────────────────────────────────────────────────

export function isTvBrowser(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /SMART-TV|Tizen|TV Safari|SAMSUNG/i.test(ua) ||
    // Samsung Tizen older UA pattern
    /Linux.*Tizen/i.test(ua) ||
    // Hisense / LG / other smart TVs (optional)
    /Linux.*WebKit/i.test(ua) && /TV/i.test(ua)
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Utils ───────────────────────────────────────────────────────────────────

function todayDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function LayananPanel({
  layanan,
  counterId,
}: {
  layanan: Layanan;
  counterId?: number;
}) {
  const [queues, setQueues] = useState<
    { id: number; ticket_number: string; status: string; counter?: { name: string }; called_at: string | null; completed_at: string | null }[]
  >([]);

  useEffect(() => {
    const params: Record<string, string> = {
      status: "called,serving",
      date: todayDate(),
    };
    if (counterId != null) params.counter_id = String(counterId);

    api
      .get(`/layanans/${layanan.id}/queues`, { params })
      .then((r) => r.data.data ?? [])
      .then(setQueues)
      .catch(() => setQueues([]));
  }, [layanan.id, counterId]);

  const sorted = useMemo(() => {
    return [...queues].sort(
      (a, b) => new Date(b.called_at ?? 0).getTime() - new Date(a.called_at ?? 0).getTime()
    );
  }, [queues]);

  const current = sorted.find((q) => q.status === "serving") ?? sorted[0] ?? null;
  const recent = sorted
    .filter((q) => q.status === "called" && q.id !== current?.id)
    .slice(0, 4);

  return (
    <LayananQueueCard
      layanan={layanan}
      currentQueue={current}
      recentQueues={recent}
    />
  );
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

function minToText(min: number): string {
  if (min < 1) return "Baru saja";
  if (min === 1) return "1 menit lalu";
  if (min < 60) return `${min} menit lalu`;
  return `${Math.floor(min / 60)} jam lalu`;
}

function LayananQueueCard({
  layanan,
  currentQueue,
  recentQueues,
}: {
  layanan: Layanan;
  currentQueue: { id: number; ticket_number: string; status: string; counter?: { name: string }; called_at: string | null; completed_at: string | null } | null;
  recentQueues: { id: number; ticket_number: string; counter?: { name: string }; called_at: string | null; completed_at: string | null }[];
}) {
  return (
    <div className="flex flex-col bg-white/90 rounded-2xl shadow-xl overflow-hidden border border-slate-200">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
          </svg>
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-white truncate">{layanan.name}</h2>
          <p className="text-blue-200 text-xs">{layanan.code}</p>
        </div>
      </div>

      {/* Current queue */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-4">
        <div
          key={currentQueue?.id ?? "empty"}
          className="transition-all duration-300"
        >
          <div className="bg-gradient-to-br from-amber-400 to-amber-500 rounded-xl px-6 py-4 shadow-lg ring-2 ring-amber-200">
            <div className="text-[4rem] font-bold text-white leading-none text-center drop-shadow-lg">
              {currentQueue?.ticket_number ?? "-"}
            </div>
          </div>
        </div>

        {currentQueue ? (
          <div className="mt-3 text-center">
            <div className="flex items-center gap-1.5 text-slate-500">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <span className="text-xs">
                {currentQueue.counter?.name
                  ? `Di-${currentQueue.counter.name}`
                  : "Dipanggil"}{" "}
                {minToText(
                  Math.floor(
                    (Date.now() - new Date(currentQueue.called_at ?? Date.now()).getTime()) /
                      60000
                  )
                )}
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

      {/* Recent */}
      <div className="border-t border-slate-200 px-3 py-2 bg-slate-50/50">
        <div className="flex items-center gap-1.5 mb-2">
          <svg className="w-3 h-3 text-emerald-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs font-semibold text-slate-600">RIWAYAT</span>
        </div>
        <div className="space-y-1 max-h-28 overflow-y-auto">
          {recentQueues.slice(0, 4).map((q) => (
            <div
              key={q.id}
              className="flex items-center justify-between bg-white rounded-lg px-3 py-1.5 shadow-sm border border-slate-100"
            >
              <span className="text-sm font-bold text-slate-700">{q.ticket_number}</span>
              <div className="flex items-center gap-1.5">
                {q.counter && (
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">
                    {q.counter.name}
                  </span>
                )}
                <span className="text-[10px] text-emerald-600">
                  ✓ {minToText(
                    Math.floor(
                      (Date.now() -
                        new Date(q.completed_at ?? q.called_at ?? Date.now()).getTime()) /
                        60000
                    )
                  )}
                </span>
              </div>
            </div>
          ))}
          {recentQueues.length === 0 && (
            <p className="text-center text-slate-400 text-xs py-2">Belum ada riwayat</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SlotTime() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-white">
        <span className="text-sm text-slate-400">📅</span>
        <span className="text-sm">
          {time.toLocaleDateString("id-ID", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </span>
      </div>
      <div className="flex items-center gap-2 text-white">
        <span className="text-lg font-mono font-bold tracking-wider" suppressHydrationWarning>
          {time.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      </div>
    </div>
  );
}

// ─── Main display content ───────────────────────────────────────────────────

function DisplayContent() {
  const searchParams = useSearchParams();
  const displayId = searchParams.get("display");
  const forceTv = searchParams.get("tv") === "1";
  const debugMode = searchParams.get("debug") === "1";

  const isTv = isTvBrowser() || forceTv;

  const [display, setDisplay] = useState<Display | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [layanans, setLayanans] = useState<Layanan[]>([]);
  const [volumeOverride, setVolumeOverride] = useState<number | null>(null);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [tvStarted, setTvStarted] = useState(!isTv); // auto-start for non-TV

  // Debug state
  const [debug, setDebug] = useState<TvDebugInfo>({
    ua: "",
    isTv: false,
    speechSynthesis: false,
    webSocket: false,
    wsConnected: false,
    lastSync: null,
    lastAnnouncement: null,
    lastError: null,
    videoErrors: [],
    announcerBlocked: false,
  });
  const debugRef = useRef(debug);
  debugRef.current = debug;

  // Initialize debug info
  useEffect(() => {
    setDebug((d) => ({
      ...d,
      ua: navigator.userAgent,
      isTv,
      speechSynthesis: "speechSynthesis" in window,
      webSocket: "WebSocket" in window,
    }));
  }, [isTv]);

  // Fetch display config
  useEffect(() => {
    const fetchDisplay = async () => {
      try {
        const res = await api.get("/displays");
        const displays: Display[] = res.data.data;
        if (displayId) {
          const selected = displays.find((d) => d.id === Number(displayId));
          if (selected) setDisplay(selected);
        } else {
          const active = displays.find((d) => d.is_active) ?? displays[0];
          if (active) setDisplay(active);
        }
      } catch {
        setDebug((d) => ({ ...d, lastError: "Gagal memuat konfigurasi display" }));
      }
    };
    fetchDisplay();
  }, [displayId]);

  // Fetch videos
  useEffect(() => {
    if (!display) return;
    api
      .get("/videos", { params: { display_id: display.id } })
      .then((res) => setVideos(res.data.data ?? []))
      .catch(() => setVideos([]));
  }, [display]);

  // Fetch layanans
  useEffect(() => {
    getLayanans(true)
      .then((res) => setLayanans(res.data ?? []))
      .catch(() => setLayanans([]));
  }, []);

  // WebSocket: display-sync
  const lastAnnouncementRef = useRef<string | null>(null);

  useDisplayChannel((event) => {
    if (!display) return;

    setDebug((d) => ({ ...d, lastSync: new Date().toLocaleTimeString("id-ID") }));

    // Announcer logic
    const queue = (event as DisplaySyncEvent).queue;
    if (!queue || queue.status !== "called") return;

    const counterId = display.settings?.counter_id;
    if (counterId != null && queue.counter_id !== counterId) return;

    const key =
      (event as DisplaySyncEvent & { announcement_id?: string }).announcement_id ??
      `${queue.id}:${queue.called_at ?? ""}`;
    if (lastAnnouncementRef.current === key) return;
    lastAnnouncementRef.current = key;

    setDebug((d) => ({ ...d, lastAnnouncement: queue.ticket_number }));
    void playAnnouncement(queue);
  });

  useVolumeChannel((event) => {
    if (!display || event.display_id !== display.id) return;
    if (event.settings) {
      setDisplay((cur) =>
        cur ? { ...cur, settings: event.settings ?? cur.settings } : cur
      );
      if (event.settings.volume != null) {
        setVolumeOverride(Math.round(event.settings.volume * 100));
      }
      return;
    }
    setVolumeOverride(Math.round(event.volume * 100));
  });

  // Polling fallback: check every 3s
  useEffect(() => {
    if (!display) return;
    const id = setInterval(async () => {
      try {
        const res = await api.get(`/displays/${display.id}/sync`);
        const data = res.data.data;
        if (data?.current_queue) {
          setDebug((d) => ({ ...d, lastSync: new Date().toLocaleTimeString("id-ID") }));
        }
      } catch {
        // silent — WS handles updates
      }
    }, isTv ? 3000 : 10000);
    return () => clearInterval(id);
  }, [display, isTv]);

  const sortedVideos = useMemo(() => {
    return [...videos].sort((a, b) => a.playlist_order - b.playlist_order);
  }, [videos]);

  const configuredVolume = useMemo(() => {
    if (display?.settings?.volume != null) {
      return Math.round((display.settings.volume as number) * 100);
    }
    const activeVideo = videos.find((v) => v.is_active);
    return Math.round((activeVideo?.volume_level ?? 0.5) * 100);
  }, [display, videos]);

  const volume = volumeOverride ?? configuredVolume;

  const playAnnouncement = useCallback(
    async (queue: Queue) => {
      if (!display || display.settings?.announcer_enabled === false) return;

      const announcerVolume = Math.min(1, Math.max(0, display.settings?.announcer_volume ?? 1));
      const counterName = queue.counter?.name ?? "loket";
      const message = `Nomor antrian ${queue.ticket_number}, silakan menuju ${counterName}`;
      const soundUrl = display.settings?.announcer_sound_url;

      if (soundUrl?.startsWith("/storage/announcers/")) {
        const audio = new Audio(soundUrl);
        audio.volume = announcerVolume;
        try {
          await audio.play();
          setSoundBlocked(false);
          setDebug((d) => ({ ...d, announcerBlocked: false }));
        } catch {
          setSoundBlocked(true);
          setDebug((d) => ({ ...d, announcerBlocked: true }));
        }
        return;
      }

      // TV fallback: speechSynthesis unavailable → just log
      if (!("speechSynthesis" in window)) {
        setDebug((d) => ({ ...d, announcerBlocked: true }));
        return;
      }

      try {
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.lang = "id-ID";
        utterance.volume = announcerVolume;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        setSoundBlocked(false);
        setDebug((d) => ({ ...d, announcerBlocked: false }));
      } catch {
        setSoundBlocked(true);
        setDebug((d) => ({ ...d, announcerBlocked: true }));
      }
    },
    [display]
  );

  const enableSound = () => {
    setSoundBlocked(false);
    // Prime audio context on TV
    const soundUrl = display?.settings?.announcer_sound_url;
    if (soundUrl?.startsWith("/storage/announcers/")) {
      const audio = new Audio(soundUrl);
      audio.volume = 0;
      audio.play().catch(() => {}).finally(() => audio.pause());
    }
    // Unlock speech
    if ("speechSynthesis" in window) {
      const utt = new SpeechSynthesisUtterance(" ");
      utt.volume = 0;
      window.speechSynthesis.speak(utt);
      window.speechSynthesis.cancel();
    }
  };

  const handleTvStart = () => {
    setTvStarted(true);
    setSoundBlocked(false);
    // Simulate click for video autoplay
    document.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  };

  const handleVideoError = (msg: string) => {
    setDebug((d) => ({
      ...d,
      videoErrors: [msg, ...d.videoErrors].slice(0, 5),
      lastError: msg,
    }));
  };

  // ─── TV Start overlay ─────────────────────────────────────────────────────
  if (isTv && !tvStarted) {
    return (
      <div
        className="h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 cursor-pointer"
        onClick={handleTvStart}
        onKeyDown={(e) => {
          if (["Enter", " ", "OK"].includes(e.key)) {
            e.preventDefault();
            handleTvStart();
          }
        }}
        tabIndex={0}
      >
        <div className="w-32 h-32 bg-white/20 rounded-3xl flex items-center justify-center mb-10 backdrop-blur-sm border-2 border-white/30">
          <Play className="w-16 h-16 text-white ml-2" />
        </div>
        <h1 className="text-6xl font-bold text-white mb-4 tracking-tight">Sistem Antrian</h1>
        <h2 className="text-3xl text-blue-200 mb-8 font-medium">Digital</h2>
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-10 py-6 border border-white/20">
          <p className="text-2xl text-white text-center mb-4">Tekan tombol OK / ENTER untuk mulai</p>
          <div className="flex items-center justify-center gap-4">
            <div className="w-24 h-1 bg-white/30 rounded" />
            <div className="w-3 h-3 bg-amber-400 rounded-full animate-pulse" />
            <div className="w-24 h-1 bg-white/30 rounded" />
          </div>
        </div>
        {debugMode && <TvDebugOverlay debug={debug} />}
      </div>
    );
  }

  // ─── Main display ──────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex gap-4 p-4 relative">
      {/* Video area */}
      <div className="w-[65%] h-full">
        {isTv ? (
          <TvVideoPlayer
            videos={sortedVideos}
            volume={volume}
            onError={handleVideoError}
          />
        ) : (
          <VideoPlayer videos={sortedVideos} volume={volume} />
        )}
      </div>

      {/* Queue panel */}
      <div className="w-[35%] h-full flex flex-col gap-3 overflow-hidden">
        <div className="flex-1 grid grid-cols-2 auto-rows-fr gap-3 overflow-y-auto py-1">
          {layanans.map((layanan) => (
            <LayananPanel
              key={layanan.id}
              layanan={layanan}
              counterId={display?.settings?.counter_id ?? undefined}
            />
          ))}
        </div>
        <div className="bg-slate-800 rounded-xl px-4 py-3">
          <SlotTime />
        </div>
      </div>

      {/* Sound blocked — TV requires interaction */}
      {soundBlocked && (
        <div className="absolute inset-x-4 bottom-4 flex justify-center">
          <button
            onClick={enableSound}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-3 text-xl font-semibold cursor-pointer"
          >
            <Volume2 className="w-6 h-6" />
            Aktifkan suara announcer
          </button>
        </div>
      )}

      {/* Debug overlay */}
      {debugMode && <TvDebugOverlay debug={debug} />}
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
        <p className="text-slate-600 text-lg">Memuat...</p>
      </div>
    </div>
  );
}

export default function DisplayPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <DisplayContent />
    </Suspense>
  );
}
