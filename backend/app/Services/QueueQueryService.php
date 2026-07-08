<?php

namespace App\Services;

use App\Models\Counter;
use App\Models\Queue;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;

class QueueQueryService
{
    /**
     * Build the scoped, filtered, paginated queue list for the index endpoint.
     *
     * Loket users are restricted to their assigned counter/layanan scope.
     * Admin/super see everything subject to the request filters.
     *
     * @param  array<string, mixed>  $filters
     */
    public function list(?User $user, array $filters = []): LengthAwarePaginator
    {
        $query = Queue::with('counter')->latest();

        if ($user && $user->isLoket()) {
            $this->applyLoketScope($query, $user);
        }

        if (isset($filters['status'])) {
            $statuses = array_filter(explode(',', (string) $filters['status']));
            $query->whereIn('status', $statuses);
        }

        if (isset($filters['service_type'])) {
            $query->where('service_type', $filters['service_type']);
        }

        if (isset($filters['date'])) {
            $query->whereDate('created_at', $filters['date']);
        } else {
            $query->whereDate('created_at', today());
        }

        if (isset($filters['counter_id'])) {
            $query->where('counter_id', $filters['counter_id']);
        }

        if (isset($filters['layanan_id'])) {
            $query->where('layanan_id', $filters['layanan_id']);
        }

        return $query->paginate($filters['per_page'] ?? 15);
    }

    /**
     * @return array<string, mixed>
     */
    public function stats(): array
    {
        $today = today();

        return [
            'active_queues' => Queue::whereIn('status', ['waiting', 'called', 'serving'])->count(),
            'waiting' => Queue::where('status', 'waiting')->count(),
            'called' => Queue::where('status', 'called')->count(),
            'serving' => Queue::where('status', 'serving')->count(),
            'completed_today' => Queue::where('status', 'completed')
                ->whereDate('completed_at', $today)
                ->count(),
            'avg_wait_minutes' => $this->calculateAvgWaitMinutes(),
        ];
    }

    public function calculateAvgWaitMinutes(): float
    {
        $completedToday = Queue::where('status', 'completed')
            ->whereDate('completed_at', today())
            ->whereNotNull('called_at')
            ->get();

        if ($completedToday->isEmpty()) {
            return 0;
        }

        $totalMinutes = $completedToday->sum(fn ($q) => $q->called_at->diffInMinutes($q->created_at));

        return round($totalMinutes / $completedToday->count(), 1);
    }

    /**
     * Restrict the query to a loket user's scope. Mirrors the original
     * controller logic verbatim:
     *  - counter has a layanan  -> scope by that layanan
     *  - counter, no layanan    -> that counter's queues + unassigned
     *  - no counter             -> assigned counters + unassigned, else none
     */
    private function applyLoketScope(Builder $query, User $user): void
    {
        $scopedCounterId = $user->counter_id;
        $scopedLayananId = null;

        if ($scopedCounterId) {
            $counter = Counter::find($scopedCounterId);
            $scopedLayananId = $counter?->layanan_id;
        }

        if ($scopedLayananId) {
            $query->where('layanan_id', $scopedLayananId);

            return;
        }

        if ($scopedCounterId) {
            $query->where(function ($q) use ($scopedCounterId) {
                $q->where('counter_id', $scopedCounterId)
                    ->orWhereNull('counter_id');
            });

            return;
        }

        $query->where(function ($q) use ($user) {
            $assignedIds = $user->assignedCounters()->pluck('counter_id');
            if ($assignedIds->isNotEmpty()) {
                $q->whereIn('counter_id', $assignedIds)
                    ->orWhereNull('counter_id');
            } else {
                $q->whereRaw('1 = 0');
            }
        });
    }
}
