"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { Video } from "@/lib/types";

export interface TvVideoPlayerHandle {
  /** Unlock audio and (re)start playback. Must be invoked synchronously from a real user gesture. */
  start: () => void;
}

interface TvVideoPlayerProps {
  videos?: Video[];
  volume: number;
  onError?: (msg: string) => void;
  ref?: Ref<TvVideoPlayerHandle>;
}

// ─── TV-safe VideoPlayer ────────────────────────────────────────────────────
// Samsung Tizen constraints:
//  - autoplay only works muted; a real user gesture (OK/Enter) is required for
//    sound. The page owns the ONE shared gesture and calls start() via ref —
//    this component has no start overlay of its own.
//  - if playlists arrive after the gesture, playback starts muted and the next
//    real remote press unlocks audio (start() is idempotent).
//  - video codec: H.264 + AAC MP4 safest; MIME inferred from file extension.
//  - no speechSynthesis, no backdrop-filter / color-mix (old WebKit): overlay
//    chips use arbitrary rgba values, margins instead of flex gap.
//  - simultaneous hardware decoding across panels is NOT guaranteed: failures
//    surface through onError and per-panel UI instead of being hidden.
//  - retry play on canplay, advance playlist on error, catch all errors.

function clampVolume(volume: number): number {
  return Math.min(100, Math.max(0, volume));
}

function mimeForUrl(url: string): string {
  const clean = url.split("?")[0].toLowerCase();
  if (clean.endsWith(".webm")) return "video/webm";
  if (clean.endsWith(".ogg") || clean.endsWith(".ogv")) return "video/ogg";
  return "video/mp4";
}

export function TvVideoPlayer({ videos = [], volume, onError, ref }: TvVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const playlistRef = useRef(videos);
  const isLoadingRef = useRef(false);
  const hasAudioUnlockedRef = useRef(false);
  const lastErrorRef = useRef<string | null>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialVolume = clampVolume(volume);
  const volumeRef = useRef(initialVolume);
  const mutedRef = useRef(initialVolume === 0);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    playlistRef.current = videos;
  }, [videos]);

  // onError identity changes on every parent re-render (setDebug); reading it
  // through a ref keeps media effects free of callback dependencies.
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    volumeRef.current = clampVolume(volume);
    mutedRef.current = volumeRef.current === 0;
    const video = videoRef.current;
    if (video && hasAudioUnlockedRef.current) {
      video.volume = volumeRef.current / 100;
      video.muted = mutedRef.current;
    }
  }, [volume]);

  // Cleanup pending error-advance timer on unmount.
  useEffect(() => {
    return () => {
      if (advanceTimerRef.current !== null) clearTimeout(advanceTimerRef.current);
    };
  }, []);

  const handleVideoEnded = useCallback(() => {
    const playlist = playlistRef.current;
    if (playlist.length === 0) return;
    if (playlist.length <= 1) {
      videoRef.current?.play().catch(() => {});
      return;
    }
    setCurrentIndex((cur) => (cur + 1) % playlist.length);
  }, []);

  const handleVideoError = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.error) return;
    const msg = `Video error ${video.error.code}: ${video.error.message}`;
    if (msg !== lastErrorRef.current) {
      lastErrorRef.current = msg;
      onErrorRef.current?.(msg);
    }
    // Try next video after short delay (tracked + cleaned up).
    const playlist = playlistRef.current;
    if (playlist.length > 1) {
      if (advanceTimerRef.current !== null) clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = setTimeout(() => {
        advanceTimerRef.current = null;
        setCurrentIndex((cur) => (cur + 1) % playlistRef.current.length);
      }, 1500);
    }
  }, []);

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
    if (!video) return;
    video.volume = volumeRef.current / 100;
    video.muted = mutedRef.current;
    video.play().catch((err) => {
      onErrorRef.current?.(
        `Audio unlock blocked: ${err instanceof Error ? err.message : String(err)}`
      );
    });
  }, []);

  useImperativeHandle(ref, () => ({ start: unlockAudio }), [unlockAudio]);

  // Auto-start muted (autoplay policy). Deliberately does NOT depend on
  // onError or volume — both are read through refs so remote volume changes
  // and debug re-renders never reload the media element. Async play() is
  // cancelled on cleanup so state is never touched after unmount.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || videos.length === 0) return;
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    let cancelled = false;

    video.muted = true;
    video.load();

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          if (cancelled) return;
          setIsPlaying(true);
          if (hasAudioUnlockedRef.current) {
            video.volume = volumeRef.current / 100;
            video.muted = mutedRef.current;
          }
        })
        .catch((err) => {
          if (cancelled) return;
          setIsPlaying(false);
          onErrorRef.current?.(
            `Playback blocked: ${err instanceof Error ? err.message : String(err)}`
          );
        })
        .finally(() => {
          if (!cancelled) isLoadingRef.current = false;
        });
    } else {
      isLoadingRef.current = false;
    }

    return () => {
      cancelled = true;
      isLoadingRef.current = false;
    };
  }, [currentIndex, videos]);

  const currentVideo = videos[currentIndex];
  const hasVideos = videos.length > 0;
  const isMuted = volume === 0;

  if (!hasVideos) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white p-8 text-center">
        <div className="text-2xl font-bold mb-3">Tidak ada video aktif</div>
        <div className="text-base text-slate-300">Antrian tetap tampil di panel kanan.</div>
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
          {currentVideo && <source src={currentVideo.file_url} type={mimeForUrl(currentVideo.file_url)} />}
        </video>

        {/* Playlist indicator — margins instead of flex gap (old Tizen) */}
        <div className="absolute bottom-4 left-4 flex items-center">
          <div className="bg-[rgba(0,0,0,0.6)] rounded-full px-3 py-2 flex items-center">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
            </svg>
            <span className="text-[rgba(255,255,255,0.7)] text-xs ml-2">
              {currentIndex + 1} / {videos.length}
            </span>
          </div>
          {isPlaying && <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse ml-2" />}
          {!audioUnlocked && (
            <div className="bg-[rgba(245,158,11,0.85)] rounded-full px-3 py-2 ml-2">
              <span className="text-black text-xs font-medium">
                Tekan OK untuk aktifkan suara
              </span>
            </div>
          )}
        </div>

        {/* Volume */}
        <div className="absolute bottom-4 right-4 flex items-center bg-[rgba(0,0,0,0.6)] rounded-full px-3 py-2">
          {isMuted ? (
            <svg className="w-4 h-4 text-[rgba(255,255,255,0.7)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
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
          <span className="text-[rgba(255,255,255,0.7)] text-xs ml-2">{volume}%</span>
        </div>
      </div>
    </div>
  );
}
