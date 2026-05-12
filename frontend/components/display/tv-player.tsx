"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Video } from "@/lib/types";

interface TvVideoPlayerProps {
  videos?: Video[];
  volume: number;
  onError?: (msg: string) => void;
}

// ─── TV-safe VideoPlayer ────────────────────────────────────────────────────
// Samsung Tizen constraints:
//  - autoplay only works muted; user gesture required for sound
//  - must handle Enter/OK remote key for start overlay
//  - video codec: H.264 + AAC MP4 safest
//  - no speechSynthesis
//  - simplified: no backdrop-filter, basic flex only
//  - retry play on canplay, catch all errors silently

function canPlayVideoMime(videos: Video[]): string {
  const testEl = document.createElement("video");
  const candidates = ["video/mp4", "video/webm", "video/ogg"];
  for (const mime of candidates) {
    if (testEl.canPlayType(mime)) return mime;
  }
  return "video/mp4";
}

export function TvVideoPlayer({ videos = [], volume, onError }: TvVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const playlistRef = useRef(videos);
  const isLoadingRef = useRef(false);
  const hasAudioUnlockedRef = useRef(false);
  const lastErrorRef = useRef<string | null>(null);
  const volumeRef = useRef(Math.min(100, Math.max(0, volume)));
  const mutedRef = useRef(volumeRef.current === 0);

  useEffect(() => {
    playlistRef.current = videos;
  }, [videos]);

  useEffect(() => {
    volumeRef.current = Math.min(100, Math.max(0, volume));
    mutedRef.current = volumeRef.current === 0;
    const video = videoRef.current;
    if (video && hasAudioUnlockedRef.current) {
      video.volume = volumeRef.current / 100;
      video.muted = mutedRef.current;
    }
  }, [volume]);

  const handleVideoEnded = useCallback(() => {
    const playlist = playlistRef.current;
    if (playlist.length <= 1) {
      videoRef.current?.play().catch(() => {});
      return;
    }
    const next = (currentIndex + 1) % playlist.length;
    setCurrentIndex(next);
  }, [currentIndex]);

  const handleVideoError = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.error) return;
    const msg = `Video error ${video.error.code}: ${video.error.message}`;
    if (msg !== lastErrorRef.current) {
      lastErrorRef.current = msg;
      onError?.(msg);
    }
    // Try next video after short delay
    const playlist = playlistRef.current;
    if (playlist.length > 1) {
      const next = (currentIndex + 1) % playlist.length;
      setTimeout(() => setCurrentIndex(next), 1500);
    }
  }, [currentIndex, onError]);

  const handleCanPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused && !video.ended) return;
    video.play().catch(() => {});
  }, []);

  const unlockAudio = useCallback(() => {
    hasAudioUnlockedRef.current = true;
    setAudioUnlocked(true);
    const video = videoRef.current;
    if (video) {
      video.volume = volumeRef.current / 100;
      video.muted = mutedRef.current;
      video.play().catch(() => {});
    }
  }, []);

  // Start playback — muted initially (autoplay policy)
  useEffect(() => {
    if (!started) return;
    const video = videoRef.current;
    if (!video || videos.length === 0) return;
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

    video.muted = true;
    video.load();

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
          // Restore volume if already unlocked
          if (hasAudioUnlockedRef.current) {
            video.volume = volumeRef.current / 100;
            video.muted = mutedRef.current;
          }
        })
        .catch((err) => {
          setIsPlaying(false);
          onError?.(`Playback blocked: ${err instanceof Error ? err.message : String(err)}`);
        })
        .finally(() => {
          isLoadingRef.current = false;
        });
    } else {
      isLoadingRef.current = false;
    }

    return () => {
      isLoadingRef.current = false;
    };
  }, [started, currentIndex, videos]);

  // Keyboard: Enter/OK to unlock audio
  useEffect(() => {
    if (!started) return;
    const handler = (e: KeyboardEvent) => {
      if (["Enter", " ", "OK", "MediaPlay", "MediaPause"].includes(e.key)) {
        e.preventDefault();
        unlockAudio();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [started, unlockAudio]);

  const currentVideo = videos[currentIndex];
  const hasVideos = videos.length > 0;
  const isMuted = volumeRef.current === 0;
  const supportedMime = canPlayVideoMime(videos);

  if (!hasVideos) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white p-8 text-center">
        <div className="text-4xl font-bold mb-4">Tidak ada video aktif</div>
        <div className="text-xl text-slate-300">Antrian tetap tampil di panel kanan.</div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 relative">
        {/* Decorative */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-32 h-32 border-4 border-white rounded-full" />
          <div className="absolute bottom-20 right-20 w-48 h-48 border-4 border-white rounded-full" />
          <div className="absolute top-1/2 left-1/4 w-24 h-24 border-4 border-white rounded-full" />
        </div>

        <div className="text-center z-10 px-8">
          <div
            className="w-24 h-24 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-8 cursor-pointer"
            onClick={() => {
              setStarted(true);
              unlockAudio();
            }}
          >
            <svg className="w-12 h-12 text-white ml-2" fill="currentColor" viewBox="0 0 24 24">
              <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
            </svg>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-4 tracking-tight">Sistem Antrian</h1>
          <h2 className="text-2xl md:text-3xl text-blue-200 mb-8 font-medium">Digital</h2>
          <p className="text-lg text-blue-200/80 max-w-md mx-auto">
            Tekan OK / ENTER untuk mulai
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <div className="w-16 h-1 bg-white/30 rounded" />
            <div className="w-2 h-2 bg-amber-400 rounded-full" />
            <div className="w-16 h-1 bg-white/30 rounded" />
          </div>
        </div>

        {/* Volume indicator */}
        <div className="absolute bottom-8 right-8 flex items-center gap-2 bg-white/10 rounded-full px-4 py-2">
          {isMuted ? (
            <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
              <line x1="22" y1="9" x2="16" y2="15" />
              <line x1="16" y1="9" x2="22" y2="15" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
              <path d="M16 9a5 5 0 0 1 0 6M19.364 18.364a9 9 0 0 0 0-12.728" />
            </svg>
          )}
          <span className="text-white/70 text-sm">{volumeRef.current}%</span>
        </div>

        {/* Codec info */}
        <div className="absolute bottom-8 left-4 text-xs text-white/30">
          codec: {supportedMime}
        </div>

        <button
          type="button"
          className="absolute inset-0 cursor-pointer"
          aria-label="Mulai display TV"
          onClick={() => {
            setStarted(true);
            unlockAudio();
          }}
        />
      </div>
    );
  }

  return (
    <div className="w-full h-full p-4">
      <div className="w-full h-full rounded-2xl overflow-hidden shadow-2xl bg-black relative">
        <video
          ref={videoRef}
          className="w-full h-full object-contain bg-black"
          muted
          playsInline
          onEnded={handleVideoEnded}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onCanPlay={handleCanPlay}
          onError={handleVideoError}
        >
          {currentVideo && <source src={currentVideo.file_url} type="video/mp4" />}
        </video>

        {/* Playlist indicator */}
        <div className="absolute bottom-4 left-4 flex items-center gap-3">
          <div className="bg-black/50 rounded-full px-3 py-2 flex items-center gap-2">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
            </svg>
            <span className="text-white/70 text-xs">
              {currentIndex + 1} / {videos.length}
            </span>
          </div>
          {isPlaying && <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />}
          {!audioUnlocked && (
            <div className="bg-amber-500/80 rounded-full px-3 py-2">
              <span className="text-black text-xs font-medium">
                Tekan OK untuk aktifkan suara
              </span>
            </div>
          )}
        </div>

        {/* Volume */}
        <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-black/50 rounded-full px-3 py-2">
          {isMuted ? (
            <svg className="w-4 h-4 text-white/70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
              <line x1="22" y1="9" x2="16" y2="15" />
              <line x1="16" y1="9" x2="22" y2="15" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
              <path d="M16 9a5 5 0 0 1 0 6M19.364 18.364a9 9 0 0 0 0-12.728" />
            </svg>
          )}
          <span className="text-white/70 text-xs">{volumeRef.current}%</span>
        </div>
      </div>
    </div>
  );
}
