"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Volume2, VolumeX } from "lucide-react";
import type { Video } from "@/lib/types";

interface VideoPlayerProps {
  videos?: Video[];
  volume: number;
}

export function VideoPlayer({ videos = [], volume }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playlistRef = useRef(videos);
  const isLoadingRef = useRef(false);
  const clampedVolume = Math.min(100, Math.max(0, volume));
  const isMuted = clampedVolume === 0;
  const playbackVolumeRef = useRef({ clampedVolume, isMuted });

  // Keep playlist ref updated
  useEffect(() => {
    playlistRef.current = videos;
  }, [videos]);

  useEffect(() => {
    playbackVolumeRef.current = { clampedVolume, isMuted };
    const video = videoRef.current;

    if (video) {
      video.volume = clampedVolume / 100;
      video.muted = isMuted;
    }
  }, [clampedVolume, isMuted]);

  // Handle video ended - play next in playlist
  const handleVideoEnded = useCallback(() => {
    const playlist = playlistRef.current;
    if (playlist.length <= 1) {
      videoRef.current?.play();
      return;
    }
    const nextIndex = (currentIndex + 1) % playlist.length;
    setCurrentIndex(nextIndex);
  }, [currentIndex]);

  // Play current video when index changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || videos.length === 0) return;

    // Prevent double-loading
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

    video.muted = true;
    video.load();

    // Play immediately after load
    video.play()
      .then(() => {
        const { clampedVolume: currentVolume, isMuted: currentMuted } = playbackVolumeRef.current;
        video.volume = currentVolume / 100;
        video.muted = currentMuted;
        setIsPlaying(true);
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          console.warn("Video play failed:", error.message);
        }
      })
      .finally(() => {
        isLoadingRef.current = false;
      });

    return () => {
      isLoadingRef.current = false;
    };
  }, [currentIndex, videos]);

  const currentVideo = videos[currentIndex];
  const hasVideos = videos.length > 0;

  if (!hasVideos) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 relative overflow-hidden">
        {/* Decorative pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-32 h-32 border-4 border-white rounded-full"></div>
          <div className="absolute bottom-20 right-20 w-48 h-48 border-4 border-white rounded-full"></div>
          <div className="absolute top-1/2 left-1/4 w-24 h-24 border-4 border-white rounded-full"></div>
        </div>

        {/* Content */}
        <div className="text-center z-10 px-8">
          <div className="w-24 h-24 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-8 backdrop-blur-sm">
            <Play className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-4 tracking-tight">
            Sistem Antrian
          </h1>
          <h2 className="text-2xl md:text-3xl text-blue-200 mb-8 font-medium">
            Digital
          </h2>
          <p className="text-lg text-blue-200/80 max-w-md mx-auto">
            Silakan tunggu nomor Anda dipanggil
          </p>

          {/* Decorative line */}
          <div className="mt-10 flex items-center justify-center gap-4">
            <div className="w-16 h-1 bg-white/30 rounded"></div>
            <div className="w-2 h-2 bg-amber-400 rounded-full"></div>
            <div className="w-16 h-1 bg-white/30 rounded"></div>
          </div>
        </div>

        {/* Volume indicator */}
        <div className="absolute bottom-8 right-8 flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2">
          {isMuted ? (
            <VolumeX className="w-5 h-5 text-white/70" />
          ) : (
            <Volume2 className="w-5 h-5 text-white" />
          )}
          <span className="text-white/70 text-sm">{clampedVolume}%</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full p-4">
      <div className="w-full h-full rounded-2xl overflow-hidden shadow-2xl bg-slate-900 relative">
        <video
          ref={videoRef}
          className="w-full h-full object-contain bg-black"
          muted={isMuted}
          playsInline
          onEnded={handleVideoEnded}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        >
          {currentVideo && <source src={currentVideo.file_url} type="video/mp4" />}
        </video>

        {/* Video progress indicator */}
        <div className="absolute bottom-4 left-4 right-20 flex items-center gap-3">
          <div className="flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-3 py-2">
            <Play className="w-4 h-4 text-white" />
            <span className="text-white/70 text-xs">
              {currentIndex + 1} / {videos.length}
            </span>
          </div>
          {isPlaying && (
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          )}
        </div>

        {/* Volume indicator */}
        <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-3 py-2">
          {isMuted ? (
            <VolumeX className="w-4 h-4 text-white/70" />
          ) : (
            <Volume2 className="w-5 h-5 text-white" />
          )}
          <span className="text-white/70 text-xs">{clampedVolume}%</span>
        </div>
      </div>
    </div>
  );
}