"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useDisplayChannel } from "@/hooks/use-websocket";
import { useVolumeChannel } from "@/hooks/use-websocket";
import { useLayananQueues } from "@/hooks/use-queue";
import { getLayanans } from "@/lib/api";
import api from "@/lib/api";
import type { Display, Layanan, Video } from "@/lib/types";
import { VideoPlayer } from "@/components/display/video-player";
import { LayananQueueCard } from "@/components/display/layanan-queue-card";
import { SlotTime } from "@/components/display/slot-time";
import { Loader2 } from "lucide-react";

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function LayananPanel({ layanan }: { layanan: Layanan }) {
  const { data: queuesData } = useLayananQueues(
    layanan.id,
    {
      status: "called,serving",
      date: todayDate(),
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

  // WebSocket: display-sync already invalidates all ["queues"] queries via use-websocket
  useDisplayChannel();

  useVolumeChannel((event) => {
    if (!display || event.display_id !== display.id) return;

    setVolumeOverride(Math.round(event.volume * 100));
  });

  return (
    <div className="h-screen flex gap-4 p-4">
      {/* Left: Video Player */}
      <div className="w-[65%] h-full">
        <VideoPlayer videos={sortedVideos} volume={volume} />
      </div>

      {/* Right: Layanan queue panels */}
      <div className="w-[35%] h-full flex flex-col gap-3 overflow-hidden">
        <div className="flex-1 grid grid-cols-2 auto-rows-fr gap-3 overflow-y-auto py-1">
          {layanans.map((layanan) => (
            <LayananPanel key={layanan.id} layanan={layanan} />
          ))}
        </div>
        <div className="bg-slate-800 rounded-xl px-4 py-3">
          <SlotTime />
        </div>
      </div>
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
