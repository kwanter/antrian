<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Layanan;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Validation\ValidationException;

class LayananService
{
    public function create(array $data, User $actor): Layanan
    {
        $this->ensureCounterIsAvailable($data['counter_id'] ?? null);

        $layanan = Layanan::create($data);

        $this->audit($actor, 'create', $layanan, $layanan->toArray());

        return $layanan->load('counter');
    }

    public function update(Layanan $layanan, array $data, User $actor): Layanan
    {
        $counterId = $data['counter_id'] ?? null;

        if (array_key_exists('counter_id', $data) && $counterId !== $layanan->counter_id) {
            $this->ensureCounterIsAvailable($counterId, $layanan);
        }

        $layanan->update($data);

        $this->audit($actor, 'update', $layanan, $layanan->toArray());

        return $layanan->load('counter');
    }

    public function deactivate(Layanan $layanan, User $actor): Layanan
    {
        $layanan->update(['is_active' => false]);

        $this->audit($actor, 'deactivate', $layanan, ['name' => $layanan->name]);

        return $layanan->load('counter');
    }

    public function queues(Layanan $layanan, array $filters = []): LengthAwarePaginator
    {
        $query = $layanan->queues()->with('counter');

        $allowedStatuses = ['called', 'serving', 'completed'];
        $statuses = isset($filters['status']) && $filters['status'] !== ''
            ? array_values(array_intersect(array_filter(explode(',', (string) $filters['status'])), $allowedStatuses))
            : ['called', 'serving'];

        if ($statuses === []) {
            $query->whereRaw('1 = 0');
        } else {
            $query->whereIn('status', $statuses);
        }

        $query->whereDate('created_at', $filters['date'] ?? today()->toDateString());

        if (isset($filters['counter_id']) && $filters['counter_id'] !== '') {
            $query->where('counter_id', (int) $filters['counter_id']);
        }

        return $query->orderBy('created_at', 'desc')->paginate(50);
    }

    public function serializeQueuePage(LengthAwarePaginator $queues): array
    {
        return [
            'data' => collect($queues->items())->map(fn ($queue) => [
                'id' => $queue->id,
                'ticket_number' => $queue->ticket_number,
                'service_type' => $queue->service_type,
                'status' => $queue->status,
                'layanan_id' => $queue->layanan_id,
                'counter_id' => $queue->counter_id,
                'counter' => $queue->counter ? [
                    'id' => $queue->counter->id,
                    'name' => $queue->counter->name,
                    'code' => $queue->counter->code,
                    'status' => $queue->counter->status,
                ] : null,
                'called_at' => $queue->called_at,
                'completed_at' => $queue->completed_at,
                'created_at' => $queue->created_at,
            ])->values(),
            'meta' => [
                'current_page' => $queues->currentPage(),
                'last_page' => $queues->lastPage(),
                'per_page' => $queues->perPage(),
                'total' => $queues->total(),
            ],
        ];
    }

    private function ensureCounterIsAvailable(?int $counterId, ?Layanan $ignore = null): void
    {
        if ($counterId === null) {
            return;
        }

        $query = Layanan::where('counter_id', $counterId);

        if ($ignore) {
            $query->where('id', '!=', $ignore->id);
        }

        if ($query->exists()) {
            throw ValidationException::withMessages([
                'counter_id' => 'Counter sudah memiliki layanan lain',
            ]);
        }
    }

    private function audit(User $actor, string $action, Layanan $layanan, array $changes): void
    {
        AuditLog::create([
            'user_id' => $actor->id,
            'action' => $action,
            'model' => 'Layanan',
            'model_id' => $layanan->id,
            'changes' => $changes,
        ]);
    }
}
