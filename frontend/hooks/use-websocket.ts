"use client";

import { useEffect, useRef } from "react";
import { useEcho } from "@/providers/websocket-provider";
import { queryClient } from "@/providers/query-provider";
import { updateQueueCaches } from "@/hooks/use-queue";
import type { QueueUpdateEvent, DisplaySyncEvent, VolumeUpdateEvent } from "@/lib/types";

type QueueCallback = (event: QueueUpdateEvent) => void;
type DisplayCallback = (event: DisplaySyncEvent) => void;
type VolumeCallback = (event: VolumeUpdateEvent) => void;

type QueuePayload = { queue?: QueueUpdateEvent["queue"] };

function hasQueuePayload(value: unknown): value is QueuePayload {
  return typeof value === "object" && value !== null && "queue" in value;
}

function useLatestRef<T>(value: T) {
  const ref = useRef(value);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}

export function useQueueChannel(onUpdate?: QueueCallback) {
  const echo = useEcho();
  const onUpdateRef = useLatestRef(onUpdate);

  useEffect(() => {
    if (!echo) return;

    const channel = echo.channel("queue-updates");

    channel.listenToAll((_eventName: string, data: unknown) => {
      const event = data as QueueUpdateEvent;

      if (event?.queue) {
        updateQueueCaches(queryClient, event.queue);
      }

      onUpdateRef.current?.(event);
    });

    return () => echo.leaveChannel("queue-updates");
  }, [echo, onUpdateRef]);
}

export function useCounterChannel(counterId: number | undefined, onUpdate?: QueueCallback) {
  const echo = useEcho();
  const onUpdateRef = useLatestRef(onUpdate);

  useEffect(() => {
    if (!echo || counterId === undefined) return;

    const channelName = `loket.${counterId}`;
    const channel = echo.channel(channelName);

    channel.listenToAll((_eventName: string, data: unknown) => {
      const event = data as QueueUpdateEvent;

      if (event?.queue) {
        updateQueueCaches(queryClient, event.queue);
      }

      onUpdateRef.current?.(event);
    });

    return () => echo.leaveChannel(channelName);
  }, [echo, counterId, onUpdateRef]);
}

export function useDisplayChannel(onSync?: DisplayCallback) {
  const echo = useEcho();
  const onSyncRef = useLatestRef(onSync);

  useEffect(() => {
    if (!echo) return;

    const channel = echo.channel("display-sync");

    channel.listenToAll((_eventName: string, data: unknown) => {
      if (hasQueuePayload(data) && data.queue) {
        updateQueueCaches(queryClient, data.queue);
      }

      onSyncRef.current?.(data as DisplaySyncEvent);
    });

    return () => echo.leaveChannel("display-sync");
  }, [echo, onSyncRef]);
}

export function useVolumeChannel(onVolume?: VolumeCallback) {
  const echo = useEcho();
  const onVolumeRef = useLatestRef(onVolume);

  useEffect(() => {
    if (!echo) return;

    const channel = echo.channel("display-volume-updates");

    channel.listenToAll((_eventName: string, data: unknown) => {
      onVolumeRef.current?.(data as VolumeUpdateEvent);
    });

    return () => echo.leaveChannel("display-volume-updates");
  }, [echo, onVolumeRef]);
}