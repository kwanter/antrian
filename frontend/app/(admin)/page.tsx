"use client";

import { StatsCards } from "@/components/admin/stats-cards";
import { QueueMonitorTable } from "@/components/admin/queue-monitor-table";
import { useQueues, useQueueStats } from "@/hooks/use-queue";

export default function AdminDashboardPage() {
  const { data: queues, isLoading, isError } = useQueues({ status: undefined, page: 1 });
  const { data: stats } = useQueueStats();

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard</h2>

      <StatsCards
        activeQueues={stats?.active_queues ?? 0}
        avgWaitMinutes={Math.round(stats?.avg_wait_minutes ?? 0)}
        activeCounters={stats?.serving ?? 0}
        printerOnline={false}
      />

      {isLoading ? (
        <div className="rounded-md border">
          <div className="p-8 text-center text-muted-foreground">
            Memuat...
          </div>
        </div>
      ) : isError ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          Gagal memuat data antrian
        </div>
      ) : (
        <QueueMonitorTable queues={queues?.data ?? []} />
      )}
    </div>
  );
}
