"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { useQueueChannel, useCounterChannel } from "@/hooks/use-websocket";
import { useQueues } from "@/hooks/use-queue";
import { useCallNext, useCompleteQueue, useSkipQueue, useCallSingleQueue, useRecallSkippedQueue } from "@/hooks/use-queue";
import { QueueCard } from "@/components/loket/queue-card";
import { CallButton } from "@/components/loket/call-button";
import { ServiceHistory } from "@/components/loket/service-history";
import { SkippedQueueList } from "@/components/loket/skipped-queue-list";
import { Printer } from "lucide-react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function LoketPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  const todayDate = new Date().toISOString().split('T')[0];
  const activeCounter = user?.counter ?? user?.assignedCounters?.[0] ?? null;
  const counterId = activeCounter?.id;
  const layananId = activeCounter?.layanan?.id;
  const queueScope = layananId
    ? { layanan_id: layananId }
    : counterId
      ? { counter_id: counterId }
      : {};

  const { data: queues } = useQueues({
    status: "waiting,called,completed,skipped",
    date: todayDate,
    ...queueScope,
  });

  const waitingQueues = queues?.data.filter((q) => q.status === "waiting") ?? [];
  const calledQueues = queues?.data.filter((q) => q.status === "called") ?? [];
  const completedQueues = queues?.data.filter((q) => q.status === "completed") ?? [];
  const skippedQueues = queues?.data.filter((q) => q.status === "skipped") ?? [];

  // Merge completed queues for service history (skip skipped — they have their own section)
  const historyQueues = completedQueues;

  const callNextMutation = useCallNext();
  const completeMutation = useCompleteQueue();
  const skipMutation = useSkipQueue();
  const callSingleMutation = useCallSingleQueue();
  const recallSkippedMutation = useRecallSkippedQueue();

  const currentQueue = calledQueues.find((q) => {
    if (layananId) return q.layanan_id === layananId;
    return q.counter_id === counterId;
  }) ?? null;

  // Realtime updates via WebSocket
  useQueueChannel(() => {
    // Queue data auto-refreshes via queryClient.invalidateQueries in hooks
  });

  useCounterChannel(counterId, () => {
    // Counter-specific updates refresh queue data
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/loket/login");
    }
  }, [isAuthenticated, isLoading, router]);

  const handlePanggil = () => {
    if (!counterId) {
      toast.error("Counter belum ditentukan");
      return;
    }
    callNextMutation.mutate(
      { counterId },
      {
        onSuccess: (queue) => {
          toast.success(`Memanggil antrian ${queue.ticket_number}`);
        },
        onError: () => {
          toast.error("Gagal memanggil antrian");
        },
      }
    );
  };

  const handlePanggilLagi = () => {
    if (!currentQueue) return;
    callSingleMutation.mutate(currentQueue.id, {
      onSuccess: (queue) => {
        toast.success(`Memanggil ulang antrian ${queue.ticket_number}`);
      },
      onError: () => {
        toast.error("Gagal memanggil antrian");
      },
    });
  };

  const handleSelesai = () => {
    if (!currentQueue) return;
    completeMutation.mutate(currentQueue.id, {
      onSuccess: () => {
        toast.success("Antrian selesai");
      },
      onError: () => {
        toast.error("Gagal menyelesaikan antrian");
      },
    });
  };

  const handleLewati = () => {
    if (!currentQueue) return;
    skipMutation.mutate(currentQueue.id, {
      onSuccess: () => {
        toast.success("Antrian dilewati");
      },
      onError: () => {
        toast.error("Gagal melewati antrian");
      },
    });
  };

  const handleRecallSkipped = (queueId: number) => {
    recallSkippedMutation.mutate(queueId, {
      onSuccess: (queue) => {
        toast.success(`Memanggil antrian ${queue.ticket_number}`);
      },
      onError: () => {
        toast.error("Gagal memanggil antrian");
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const waitingCount = waitingQueues.length;

  return (
    <div className="max-w-lg mx-auto space-y-8">
      {/* Current queue display */}
      <div className="text-center">
        <p className="text-sm text-slate-500 mb-2">Antrian Saat Ini</p>
        <QueueCard queue={currentQueue} />
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-4 flex-wrap">
        <CallButton
          label="Panggil"
          icon={<Printer className="w-5 h-5" />}
          variant="default"
          onClick={handlePanggil}
          disabled={callNextMutation.isPending || waitingCount === 0}
        />
        <CallButton
          label="Panggil Lagi"
          icon={<span className="text-xl">↻</span>}
          variant="outline"
          onClick={handlePanggilLagi}
          disabled={!currentQueue || callSingleMutation.isPending}
        />
        <CallButton
          label="Selesai"
          icon={<span className="text-xl">✓</span>}
          variant="default"
          onClick={handleSelesai}
          disabled={!currentQueue || completeMutation.isPending}
        />
        <CallButton
          label="Lewati"
          icon={<span className="text-xl">→</span>}
          variant="outline"
          onClick={handleLewati}
          disabled={!currentQueue || skipMutation.isPending}
        />
      </div>

      {/* Waiting info */}
      {waitingCount > 0 && (
        <p className="text-center text-slate-500 text-sm">
          {waitingCount} antrian lagi dalam antrean
        </p>
      )}

      {/* Skipped queue list — inline actionable section */}
      <SkippedQueueList
        queues={skippedQueues}
        onRecall={handleRecallSkipped}
        isRecalling={recallSkippedMutation.isPending}
      />

      {/* Service history */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800 mb-3">Riwayat Layanan Hari Ini</h2>
        <ServiceHistory queues={historyQueues} />
      </div>
    </div>
  );
}