"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import api from "@/lib/api";
import type {
  Queue,
  PaginatedResponse,
  ApiResponse,
  QueueStatus,
} from "@/lib/types";

const QUEUES_KEY = ["queues"];

type QueueQueryParams = {
  status?: QueueStatus | string;
  service_type?: string;
  date?: string;
  page?: number;
  counter_id?: number;
  layanan_id?: number;
};

function isQueueQueryParams(value: unknown): value is QueueQueryParams | undefined {
  return value === undefined || (typeof value === "object" && value !== null && !Array.isArray(value));
}

function todayIsoDate() {
  return new Date().toISOString().split("T")[0];
}

function queueMatchesParams(queue: Queue, params: QueueQueryParams | undefined) {
  const queueDate = queue.created_at?.slice(0, 10);
  const targetDate = params?.date ?? todayIsoDate();

  if (queueDate !== targetDate) return false;
  if (params?.service_type && queue.service_type !== params.service_type) return false;
  if (params?.counter_id !== undefined && queue.counter_id !== params.counter_id) return false;
  if (params?.layanan_id !== undefined && queue.layanan_id !== params.layanan_id) return false;

  if (!params?.status) return true;

  return String(params.status)
    .split(",")
    .filter(Boolean)
    .includes(queue.status);
}

function updatePaginatedQueueCache(cache: PaginatedResponse<Queue>, queue: Queue, params: QueueQueryParams | undefined) {
  const idx = cache.data.findIndex((q) => q.id === queue.id);
  const nextQueue = idx === -1 ? queue : { ...cache.data[idx], ...queue };
  const matches = queueMatchesParams(nextQueue, params);

  if (idx === -1 && (!matches || (params?.page ?? 1) > 1)) return cache;

  if (idx === -1) {
    return {
      ...cache,
      data: [nextQueue, ...cache.data],
      meta: { ...cache.meta, total: cache.meta.total + 1 },
    };
  }

  if (!matches) {
    return {
      ...cache,
      data: cache.data.filter((q) => q.id !== queue.id),
      meta: { ...cache.meta, total: Math.max(0, cache.meta.total - 1) },
    };
  }

  const data = [...cache.data];
  data[idx] = nextQueue;

  return { ...cache, data };
}

function queueParamsFromKey(queryKey: QueryKey): QueueQueryParams | undefined {
  const [, scopeOrParams, layananId, layananParams] = queryKey;

  if (scopeOrParams === "layanan" && typeof layananId === "number" && isQueueQueryParams(layananParams)) {
    return { ...layananParams, layanan_id: layananId };
  }

  if (isQueueQueryParams(scopeOrParams)) {
    return scopeOrParams;
  }

  return undefined;
}

export function updateQueueCaches(qc: QueryClient, queue: Queue) {
  const entries = qc.getQueriesData<PaginatedResponse<Queue>>({ queryKey: QUEUES_KEY });

  for (const [queryKey, cache] of entries) {
    const params = queueParamsFromKey(queryKey as QueryKey);
    if (!cache?.data || !Array.isArray(cache.data)) continue;

    const updated = updatePaginatedQueueCache(cache, queue, params);
    if (updated !== cache) {
      qc.setQueryData(queryKey, updated);
    }
  }
}

export function useQueues(params?: {
  status?: QueueStatus | string;
  service_type?: string;
  date?: string;
  page?: number;
  counter_id?: number;
  layanan_id?: number;
}) {
  return useQuery({
    staleTime: 5_000,
    queryKey: [...QUEUES_KEY, params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Queue>>("/queues", {
        params,
      });
      return data;
    },
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { layanan_id?: number; service_type?: string }) => {
      const { data } = await api.post<ApiResponse<Queue>>("/queues", params);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUEUES_KEY }),
  });
}

export function useCallNext() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      counterId,
      queueId,
    }: {
      counterId: number;
      queueId?: number;
    }) => {
      const url = queueId
        ? `/queues/${queueId}/call`
        : `/counters/${counterId}/call-next`;
      const { data } = await api.post<ApiResponse<Queue>>(url);
      return data.data;
    },
    onSuccess: (queue) => updateQueueCaches(qc, queue),
  });
}

export function useCompleteQueue() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (queueId: number) => {
      const { data } = await api.post<ApiResponse<Queue>>(
        `/queues/${queueId}/complete`,
      );
      return data.data;
    },
    onSuccess: (queue) => updateQueueCaches(qc, queue),
  });
}

export function useSkipQueue() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (queueId: number) => {
      const { data } = await api.post<ApiResponse<Queue>>(
        `/queues/${queueId}/skip`,
      );
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUEUES_KEY }),
  });
}

export function useCallSingleQueue() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (queueId: number) => {
      const { data } = await api.post<ApiResponse<Queue>>(
        `/queues/${queueId}/recall`,
      );
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUEUES_KEY }),
  });
}

export interface QueueStats {
  active_queues: number;
  waiting: number;
  called: number;
  serving: number;
  completed_today: number;
  avg_wait_minutes: number;
}

export function useQueueStats() {
  return useQuery({
    staleTime: 0,
    queryKey: [...QUEUES_KEY, "stats"],
    queryFn: async () => {
      const { data } = await api.get("/queues/stats");
      return data.data as QueueStats;
    },
  });
}

export function useLayananQueues(
  layananId: number | undefined,
  params?: { status?: QueueStatus | string; date?: string },
  options?: { refetchInterval?: number },
) {
  return useQuery({
    staleTime: 0,
    refetchInterval: options?.refetchInterval,
    enabled: layananId != null,
    queryKey: [...QUEUES_KEY, "layanan", layananId, params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Queue>>(
        `/layanans/${layananId}/queues`,
        { params },
      );
      return data;
    },
  });
}
