"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Volume2, Play, AlertCircle } from "lucide-react";
import { VideoPlayer } from "@/components/display/video-player";
import { TvVideoPlayer, type TvVideoPlayerHandle } from "@/components/display/tv-player";
import { TvDebugOverlay } from "@/components/display/tv-debug-overlay";
import { getLayanans } from "@/lib/api";
import api from "@/lib/api";
import { resolveBackendUrl } from "@/lib/utils";
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

// ─── Utils ─────────────────────────────────────────────────────────────────

const APP_TIMEZONE = "Asia/Makassar";
const APP_TIMEZONE_LABEL = "WITA";
const DISPLAY_POLL_MS = 15_000;

function todayDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Deep equality via stable serialization — keeps state identities (and thus
 *  mounted <video> elements) untouched when polled data is unchanged. */
function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Active videos for one display, in playlist order. */
function activePlaylist(videos: Video[]): Video[] {
  return videos
    .filter((v) => v.is_active)
    .sort((a, b) => a.playlist_order - b.playlist_order);
}

/** Configured volume (0-100) for a display: settings.volume, else first
 *  active video's volume_level, else neutral 50. */
function configuredVolumeFor(display: Display, videos: Video[]): number {
  if (display.settings?.volume != null) {
    return Math.round(display.settings.volume * 100);
  }
  const first = videos[0];
  if (first) return Math.round(first.volume_level * 100);
  return 50;
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
      status: "called,serving,completed",
      date: todayDate(),
    };
    if (counterId != null) params.counter_id = String(counterId);

    api
      .get(`/layanans/${layanan.id}/queues`, { params })
      .then((r) => r.data.data ?? [])
      .then(setQueues)
      .catch(() => setQueues([]));
  }, [layanan.id, counterId]);

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const sorted = useMemo(() => {
    return [...queues].sort(
      (a, b) => new Date(b.called_at ?? 0).getTime() - new Date(a.called_at ?? 0).getTime()
    );
  }, [queues]);

  const current = sorted.find((q) => q.status === "serving" || q.status === "called") ?? sorted[0] ?? null;
  const recent = sorted
    .filter((q) => q.status === "completed" && q.id !== current?.id)
    .slice(0, 4);

  return (
    <LayananQueueCard
      layanan={layanan}
      currentQueue={current}
      recentQueues={recent}
      now={now}
    />
  );
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
  now,
}: {
  layanan: Layanan;
  currentQueue: { id: number; ticket_number: string; status: string; counter?: { name: string }; called_at: string | null; completed_at: string | null } | null;
  recentQueues: { id: number; ticket_number: string; counter?: { name: string }; called_at: string | null; completed_at: string | null }[];
  now: number;
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
                    (now - new Date(currentQueue.called_at ?? now).getTime()) /
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
                      (now -
                        new Date(q.completed_at ?? q.called_at ?? now).getTime()) /
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
            timeZone: APP_TIMEZONE,
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })} · {APP_TIMEZONE_LABEL}
        </span>
      </div>
      <div className="flex items-center gap-2 text-white">
        <span className="text-lg font-mono font-bold tracking-wider" suppressHydrationWarning>
          {time.toLocaleTimeString("id-ID", { timeZone: APP_TIMEZONE, hour: "2-digit", minute: "2-digit", second: "2-digit" })} {APP_TIMEZONE_LABEL}
        </span>
      </div>
    </div>
  );
}

function VideoAreaMessage({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white p-8 text-center rounded-2xl">
      <p className="text-2xl font-bold">{title}</p>
      <p className="text-sm text-slate-300 mt-3 max-w-md">{subtitle}</p>
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

  const [displayList, setDisplayList] = useState<Display[]>([]);
  const [displaysLoaded, setDisplaysLoaded] = useState(false);
  const [videosByDisplay, setVideosByDisplay] = useState<Record<number, Video[]>>({});
  const [layanans, setLayanans] = useState<Layanan[]>([]);
  const [volumeOverrides, setVolumeOverrides] = useState<Record<number, number>>({});
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [tvStarted, setTvStarted] = useState(!isTv); // non-TV starts immediately
  const volumeRevision = useRef(0);

  // Debug state
  const [debug, setDebug] = useState<TvDebugInfo>(() => ({
    ua: typeof navigator === "undefined" ? "" : navigator.userAgent,
    isTv,
    speechSynthesis: typeof window !== "undefined" && "speechSynthesis" in window,
    webSocket: typeof window !== "undefined" && "WebSocket" in window,
    wsConnected: false,
    lastSync: null,
    lastAnnouncement: null,
    lastError: null,
    videoErrors: [],
    announcerBlocked: false,
  }));

  // ─── Display + playlist polling (initial fetch + refresh ≤ 30s) ───────────
  // State identities are preserved (sameJson) so unchanged panels never reload
  // their <video> elements. Outstanding async work is cancelled on unmount or
  // when the display param changes.
  useEffect(() => {
    let cancelled = false;
    let requestVersion = 0;
    const refresh = async () => {
      const version = ++requestVersion;
      const revision = volumeRevision.current;
      try {
        const res = await api.get("/displays", { timeout: 10000 });
        const list = (res.data.data ?? []) as Display[];
        if (cancelled || version !== requestVersion) return;
        setDisplaysLoaded(true);
        const liveUpdateDuringFetch = revision !== volumeRevision.current;
        setDisplayList((prev) => {
          const next = liveUpdateDuringFetch
            ? list.map((d) => ({ ...d, settings: prev.find((old) => old.id === d.id)?.settings ?? d.settings }))
            : list;
          return sameJson(prev, next) ? prev : next;
        });
        if (!liveUpdateDuringFetch) {
          // A fresh server read becomes authoritative again. A WS update that
          // arrived while this read was pending stays in effect until next poll.
          setVolumeOverrides((prev) => Object.keys(prev).length ? {} : prev);
        }

        // Explicit ?display=ID: only that display (never substitutes another).
        // No param: every active display gets a panel.
        const selected = displayId ? list.find((d) => d.id === Number(displayId)) : undefined;
        const targets = displayId ? (selected ? [selected] : []) : list.filter((d) => d.is_active);

        const results = await Promise.all(
          targets.map((d) =>
            api
              .get("/videos", { params: { display_id: d.id, is_active: true }, timeout: 10000 })
              .then((r) => [d.id, (r.data.data ?? []) as Video[]] as const)
              .catch(() => [d.id, null] as const)
          )
        );
        if (cancelled || version !== requestVersion) return;
        setVideosByDisplay((prev) => {
          const next: Record<number, Video[]> = {};
          for (const [id, raw] of results) {
            const prevList = prev[id];
            const sorted = raw === null ? prevList ?? [] : activePlaylist(raw);
            next[id] = sameJson(prevList, sorted) ? prevList : sorted;
          }
          return sameJson(prev, next) ? prev : next;
        });
      } catch {
        if (!cancelled && version === requestVersion) setDisplaysLoaded(true);
      }
    };
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, DISPLAY_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [displayId]);

  // Fetch layanans (queue panel)
  useEffect(() => {
    getLayanans(true)
      .then((res) => setLayanans(res.data ?? []))
      .catch(() => setLayanans([]));
  }, []);

  // ─── Panel selection ────────────────────────────────────────────────────────

  const selectedExplicit = useMemo(
    () => (displayId ? displayList.find((d) => d.id === Number(displayId)) ?? null : null),
    [displayList, displayId]
  );

  const panels = useMemo(
    () =>
      displayId
        ? selectedExplicit
          ? [selectedExplicit]
          : []
        : displayList.filter((d) => d.is_active),
    [displayList, displayId, selectedExplicit]
  );

  // Announcer (and queue-panel counter filter) follows the explicitly selected
  // display, or the primary (first active) display in multi mode. Exactly one
  // announcer exists — per-panel announcing is never duplicated.
  const announcerDisplay = selectedExplicit ?? panels[0] ?? null;

  // ─── WebSocket: display-sync (single announcer) ────────────────────────────
  const lastAnnouncementRef = useRef<string | null>(null);

  const playAnnouncement = useCallback(
    async (queue: Queue) => {
      if (!announcerDisplay || announcerDisplay.settings?.announcer_enabled === false) return;

      const announcerVolume = Math.min(1, Math.max(0, announcerDisplay.settings?.announcer_volume ?? 1));

      // 1) Try backend dynamic TTS (edge-tts, female Indonesian voice)
      try {
        const res = await api.get(`/tts/queue/${queue.id}`);
        const { audio_url } = res.data;
        if (audio_url) {
          const audio = new Audio(resolveBackendUrl(audio_url));
          audio.volume = announcerVolume;
          await audio.play();
          setSoundBlocked(false);
          setDebug((d) => ({ ...d, announcerBlocked: false }));
          return;
        }
      } catch {
        // fall through
      }

      // 2) Fallback: uploaded announcer sound
      const soundUrl = announcerDisplay.settings?.announcer_sound_url;
      if (soundUrl?.startsWith("/storage/announcers/")) {
        const audio = new Audio(resolveBackendUrl(soundUrl));
        audio.volume = announcerVolume;
        try {
          await audio.play();
          setSoundBlocked(false);
          setDebug((d) => ({ ...d, announcerBlocked: false }));
          return;
        } catch {
          setSoundBlocked(true);
          setDebug((d) => ({ ...d, announcerBlocked: true }));
          return;
        }
      }

      // 3) Last-ditch: browser speechSynthesis (robotic, not ideal)
      if (!("speechSynthesis" in window)) {
        setDebug((d) => ({ ...d, announcerBlocked: true }));
        return;
      }

      try {
        const counterName = queue.counter?.name ?? "loket";
        const message = `Nomor antrian ${queue.ticket_number}, silakan menuju ${counterName}`;
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
    [announcerDisplay]
  );

  useDisplayChannel((event) => {
    setDebug((d) => ({ ...d, lastSync: new Date().toLocaleTimeString("id-ID", { timeZone: APP_TIMEZONE }) }));
    if (!announcerDisplay) return;

    // Announcer logic
    const queue = (event as DisplaySyncEvent).queue;
    if (!queue || queue.status !== "called") return;

    const counterId = announcerDisplay.settings?.counter_id;
    if (counterId != null && queue.counter_id !== counterId) return;

    const key =
      (event as DisplaySyncEvent & { announcement_id?: string }).announcement_id ??
      `${queue.id}:${queue.called_at ?? ""}`;
    if (lastAnnouncementRef.current === key) return;
    lastAnnouncementRef.current = key;

    setDebug((d) => ({ ...d, lastAnnouncement: queue.ticket_number }));
    void playAnnouncement(queue);
  });

  // ─── WebSocket: volume (ONE parent subscription, routed by display id) ─────
  // Live WS volume wins over in-flight reads; the next fresh poll reconciles it.
  useVolumeChannel((event) => {
    volumeRevision.current += 1;
    const settings = event.settings;
    setVolumeOverrides((prev) => {
      const nextVol = Math.round(event.volume * 100);
      if (prev[event.display_id] === nextVol) return prev;
      return { ...prev, [event.display_id]: nextVol };
    });
    if (settings) {
      setDisplayList((prev) => {
        let changed = false;
        const next = prev.map((d) => {
          if (d.id !== event.display_id) return d;
          const merged = { ...d, settings };
          if (sameJson(d, merged)) return d;
          changed = true;
          return merged;
        });
        return changed ? next : prev;
      });
    }
  });

  // Polling fallback for announcement sync debug (single subscription point)
  useEffect(() => {
    if (!announcerDisplay) return;
    const id = setInterval(async () => {
      try {
        const res = await api.get(`/displays/${announcerDisplay.id}/sync`);
        const data = res.data.data;
        if (data?.current_queue) {
          setDebug((d) => ({ ...d, lastSync: new Date().toLocaleTimeString("id-ID", { timeZone: APP_TIMEZONE }) }));
        }
      } catch {
        // silent — WS handles updates
      }
    }, isTv ? 3000 : 10000);
    return () => clearInterval(id);
  }, [announcerDisplay, isTv]);

  // ─── Shared TV start (ONE gesture starts/unlocks all panels) ────────────────
  const tvPanelRefs = useRef(new Map<number, TvVideoPlayerHandle>());

  const setTvRef = useCallback((id: number) => (el: TvVideoPlayerHandle | null) => {
    if (el) {
      tvPanelRefs.current.set(id, el);
    } else {
      tvPanelRefs.current.delete(id);
    }
  }, []);

  const startAllPanels = useCallback(() => {
    setTvStarted(true);
    setSoundBlocked(false);
    // Synchronous imperative unlock on every mounted panel — no synthetic
    // clicks. Idempotent: safe to repeat on every subsequent real remote press
    // (covers playlists that arrived after the first gesture; those started
    // muted and unlock on this next real press — audio is NOT assumed
    // universally unlocked by state).
    tvPanelRefs.current.forEach((panel) => panel.start());
  }, []);

  const startAllRef = useRef(startAllPanels);
  useEffect(() => {
    startAllRef.current = startAllPanels;
  }, [startAllPanels]);

  // Single page-level gesture listener: before start it starts everything;
  // afterwards each real OK/Enter/click re-unlocks any panel that mounted or
  // received videos late.
  useEffect(() => {
    if (!isTv) return;
    const keys = ["Enter", " ", "OK", "MediaPlay", "MediaPause"];
    const onKeyDown = (e: KeyboardEvent) => {
      if (!keys.includes(e.key)) return;
      e.preventDefault();
      startAllRef.current();
    };
    const onClick = () => {
      startAllRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("click", onClick);
    };
  }, [isTv]);

  const handleVideoError = useCallback((msg: string) => {
    setDebug((d) => ({
      ...d,
      videoErrors: [msg, ...d.videoErrors].slice(0, 5),
      lastError: msg,
    }));
  }, []);

  // ─── Video area rendering ────────────────────────────────────────────────────

  const volumeFor = useCallback(
    (d: Display) => volumeOverrides[d.id] ?? configuredVolumeFor(d, videosByDisplay[d.id] ?? []),
    [volumeOverrides, videosByDisplay]
  );

  const renderVideoArea = () => {
    if (!displaysLoaded) {
      return (
        <VideoAreaMessage
          title="Memuat..."
          subtitle="Mengambil konfigurasi display"
        />
      );
    }
    // Explicit ID that matched no display — never falls back to another one.
    if (displayId && !selectedExplicit) {
      return (
        <VideoAreaMessage
          title="Display tidak ditemukan"
          subtitle={`Display dengan ID "${displayId}" tidak tersedia. Periksa kembali tautan atau aturan display di panel admin.`}
        />
      );
    }
    if (panels.length === 0) {
      return (
        <VideoAreaMessage
          title="Tidak ada display aktif"
          subtitle="Aktifkan minimal satu display dari panel admin untuk menampilkan video."
        />
      );
    }
    return panels.map((d) => {
      const vids = videosByDisplay[d.id] ?? [];
      // Remount only on a REAL playlist change (add/remove/reorder) so a
      // shrunken playlist can never leave an out-of-range index behind.
      const playlistKey = `${d.id}:${vids.map((v) => v.id).join("-")}`;
      return (
        <div key={d.id} className="relative flex-1 min-w-0 h-full ml-2 first:ml-0">
          <span className="absolute top-3 left-3 z-10 bg-[rgba(15,23,42,0.78)] text-white text-xs font-medium px-2.5 py-1 rounded-full pointer-events-none">
            {d.name}
          </span>
          {vids.length === 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center rounded-2xl">
              <p className="text-xl font-bold">{d.name}</p>
              <p className="text-sm text-slate-300 mt-2">Tidak ada video aktif</p>
              <p className="text-xs text-slate-400 mt-1">Antrian tetap tampil di panel kanan.</p>
            </div>
          ) : isTv ? (
            <TvVideoPlayer
              key={playlistKey}
              ref={setTvRef(d.id)}
              videos={vids}
              volume={volumeFor(d)}
              onError={handleVideoError}
            />
          ) : (
            <VideoPlayer key={playlistKey} videos={vids} volume={volumeFor(d)} />
          )}
        </div>
      );
    });
  };

  const enableSound = () => {
    setSoundBlocked(false);
    // Prime backend audio so TV/user-gesture is satisfied for first TTS call
    const soundUrl = announcerDisplay?.settings?.announcer_sound_url;
    if (soundUrl?.startsWith("/storage/announcers/")) {
      const audio = new Audio(resolveBackendUrl(soundUrl));
      audio.volume = 0;
      audio.play().catch(() => {}).finally(() => audio.pause());
    }
  };

  // ─── Main display ──────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex gap-4 p-4 relative">
      {/* Video area — one panel per active display (or the explicit display) */}
      <div className="w-[65%] h-full flex min-w-0">{renderVideoArea()}</div>

      {/* Queue panel */}
      <div className="w-[35%] h-full flex flex-col gap-3 overflow-hidden">
        <div className="flex-1 grid grid-cols-2 auto-rows-fr gap-3 overflow-y-auto py-1">
          {layanans.map((layanan) => (
            <LayananPanel
              key={layanan.id}
              layanan={layanan}
              counterId={announcerDisplay?.settings?.counter_id ?? undefined}
            />
          ))}
        </div>
        <div className="bg-slate-800 rounded-xl px-4 py-3">
          <SlotTime />
        </div>
      </div>

      {/* Shared TV start overlay — panels stay mounted (muted) behind it so the
          real gesture can unlock every element synchronously via refs */}
      {isTv && !tvStarted && (
        <div
          className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[rgba(2,6,23,0.97)] cursor-pointer outline-none"
          tabIndex={0}
          role="button"
          aria-label="Mulai display"
          autoFocus
        >
          <div className="w-32 h-32 bg-[rgba(255,255,255,0.15)] rounded-3xl flex items-center justify-center mb-10 border-2 border-[rgba(255,255,255,0.3)]">
            <Play className="w-16 h-16 text-white ml-2" />
          </div>
          <h1 className="text-6xl font-bold text-white mb-4 tracking-tight">Sistem Antrian Digital</h1>
          <div className="bg-[rgba(255,255,255,0.1)] rounded-2xl px-10 py-6 border border-[rgba(255,255,255,0.2)]">
            <p className="text-2xl text-white text-center mb-4">Tekan tombol OK / ENTER untuk mulai</p>
            <div className="flex items-center justify-center gap-4">
              <div className="w-24 h-1 bg-[rgba(255,255,255,0.3)] rounded" />
              <div className="w-3 h-3 bg-amber-400 rounded-full animate-pulse" />
              <div className="w-24 h-1 bg-[rgba(255,255,255,0.3)] rounded" />
            </div>
          </div>
        </div>
      )}

      {/* Sound blocked — announcer requires interaction */}
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
