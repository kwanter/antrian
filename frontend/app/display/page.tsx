"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useDisplayChannel } from "@/hooks/use-websocket";
import { useVolumeChannel } from "@/hooks/use-websocket";
import { useLayananQueues } from "@/hooks/use-queue";
import { getLayanans } from "@/lib/api";
import api from "@/lib/api";
import type { Display, Layanan, Queue, Video } from "@/lib/types";
import { VideoPlayer } from "@/components/display/video-player";
import { LayananQueueCard } from "@/components/display/layanan-queue-card";
import { SlotTime } from "@/components/display/slot-time";
import { Button } from "@/components/ui/button";
import { Loader2, Volume2 } from "lucide-react";

function todayDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function LayananPanel({ layanan, counterId }: { layanan: Layanan; counterId?: number }) {
  const { data: queuesData } = useLayananQueues(
    layanan.id,
    {
      status: "called,serving",
      date: todayDate(),
      ...(counterId != null ? { counter_id: counterId } : {}),
    },
    { refetchInterval: 10000 }
  );

  const sorted = useMemo(() => {
    if (!queuesData?.data) return [];
    return [...queuesData.data].sort(
      (a, b) =>
        new Date(b.called_at ?? 0).getTime() -
        new Date(a.called_at ?? 0).getTime()
    );
  }, [queuesData]);

  const currentQueue = sorted.find((queue) => queue.status === "serving") ?? sorted[0] ?? null;
  const recentQueues = sorted
    .filter((queue) => queue.status === "called" && queue.id !== currentQueue?.id)
    .slice(0, 4);

  return (
    <LayananQueueCard
      layanan={layanan}
      currentQueue={currentQueue}
      recentQueues={recentQueues}
    />
  );
}

function DisplayContent() {
  const searchParams = useSearchParams();
  const displayId = searchParams.get("display");

  const [display, setDisplay] = useState<Display | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [layanans, setLayanans] = useState<Layanan[]>([]);
  const [volumeOverride, setVolumeOverride] = useState<number | null>(null);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const lastAnnouncementRef = useRef<string | null>(null);

  // Fetch display config
  useEffect(() => {
    const fetchDisplay = async () => {
      try {
        const res = await api.get("/displays");
        const displays: Display[] = res.data.data;

        if (displayId) {
          const selected = displays.find((d) => d.id === Number(displayId));
          if (selected) setDisplay(selected);
          return;
        }

        const active = displays.find((d) => d.is_active) ?? displays[0];
        if (active) setDisplay(active);
      } catch {
        // Display not found
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
      .catch(() => {});
  }, [display]);

  // Fetch active layanans
  useEffect(() => {
    getLayanans(true)
      .then((res) => setLayanans(res.data ?? []))
      .catch(() => {});
  }, []);

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

  const shouldAnnounceQueue = useCallback((queue: Queue) => {
    const counterId = display?.settings?.counter_id;
    return counterId == null || queue.counter_id === counterId;
  }, [display?.settings?.counter_id]);

  const playAnnouncement = useCallback(async (queue: Queue) => {
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
      } catch {
        setSoundBlocked(true);
      }

      return;
    }

    if (!("speechSynthesis" in window)) return;

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = "id-ID";
    utterance.volume = announcerVolume;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSoundBlocked(false);
  }, [display]);

  const enableSound = () => {
    const soundUrl = display?.settings?.announcer_sound_url;
    if (!soundUrl?.startsWith("/storage/announcers/")) {
      setSoundBlocked(false);
      return;
    }

    const audio = new Audio(soundUrl);
    audio.volume = 0;
    void audio.play().catch(() => {}).finally(() => {
      audio.pause();
      setSoundBlocked(false);
    });
  };

  // WebSocket: display-sync already invalidates all ["queues"] queries via use-websocket
  useDisplayChannel((event) => {
    const queue = event.queue;
    if (!queue || queue.status !== "called" || !shouldAnnounceQueue(queue)) return;

    const announcementKey = `${queue.id}:${queue.called_at ?? ""}`;
    if (lastAnnouncementRef.current === announcementKey) return;

    lastAnnouncementRef.current = announcementKey;
    void playAnnouncement(queue);
  });

  useVolumeChannel((event) => {
    if (!display || event.display_id !== display.id) return;

    if (event.settings) {
      setDisplay((current) => current ? { ...current, settings: event.settings ?? current.settings } : current);

      if (event.settings.volume != null) {
        setVolumeOverride(Math.round(event.settings.volume * 100));
      }

      return;
    }

    setVolumeOverride(Math.round(event.volume * 100));
  });

  return (
    <div className="h-screen flex gap-4 p-4 relative">
      <div className="w-[65%] h-full">
        <VideoPlayer videos={sortedVideos} volume={volume} />
      </div>

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

      {soundBlocked && (
        <div className="absolute inset-x-4 bottom-4 flex justify-center">
          <Button onClick={enableSound} className="shadow-lg">
            <Volume2 className="mr-2 h-4 w-4" />
            Aktifkan suara announcer
          </Button>
        </div>
      )}
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
