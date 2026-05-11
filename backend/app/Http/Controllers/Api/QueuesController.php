<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreQueueRequest;
use App\Models\AuditLog;
use App\Models\Queue;
use App\Models\QueueLog;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class QueuesController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = Queue::with('counter')->latest();

        // Enforce scope for loket users: only their assigned counter's queues
        if ($user && ($user->isLoket())) {
            $scopedCounterId = $user->counter_id;
            $scopedLayananId = null;

            if ($scopedCounterId) {
                $counter = \App\Models\Counter::find($scopedCounterId);
                $scopedLayananId = $counter?->layanan_id;
            }

            if ($scopedLayananId) {
                $query->where('layanan_id', $scopedLayananId);
            } elseif ($scopedCounterId) {
                $query->where(function ($q) use ($scopedCounterId) {
                    $q->where('counter_id', $scopedCounterId)
                      ->orWhereNull('counter_id');
                });
            } else {
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

        // Filter by status
        if ($request->has('status')) {
            $statuses = array_filter(explode(',', (string) $request->status));
            $query->whereIn('status', $statuses);
        }

        // Filter by service_type
        if ($request->has('service_type')) {
            $query->where('service_type', $request->service_type);
        }

        // Filter by date
        if ($request->has('date')) {
            $query->whereDate('created_at', $request->date);
        } else {
            // Default: today
            $query->whereDate('created_at', today());
        }

        // Filter by counter
        if ($request->has('counter_id')) {
            $query->where('counter_id', $request->counter_id);
        }

        // Filter by layanan
        if ($request->has('layanan_id')) {
            $query->where('layanan_id', $request->layanan_id);
        }

        $perPage = $request->get('per_page', 15);
        $queues = $query->paginate($perPage);

        return response()->json([
            'data' => $queues->items(),
            'meta' => [
                'current_page' => $queues->currentPage(),
                'last_page' => $queues->lastPage(),
                'per_page' => $queues->perPage(),
                'total' => $queues->total(),
            ],
        ]);
    }

    public function store(StoreQueueRequest $request): JsonResponse
    {
        $ticketNumber = $this->generateTicketNumber($request->layanan_id);

        $serviceType = $request->service_type;
        $counterId = null;

        if ($request->filled('layanan_id')) {
            $layanan = \App\Models\Layanan::with('counter')->find($request->layanan_id);
            if ($layanan && $layanan->counter) {
                $counterId = $layanan->counter->id;
                $serviceType = $serviceType ?? $layanan->name;
            }
        }

        $queue = Queue::create([
            'ticket_number' => $ticketNumber,
            'service_type' => $serviceType,
            'layanan_id' => $request->layanan_id,
            'counter_id' => $counterId,
            'customer_name' => $request->customer_name,
            'customer_phone' => $request->customer_phone,
            'status' => 'waiting',
        ]);

        QueueLog::create([
            'queue_id' => $queue->id,
            'action' => 'created',
            'performed_by' => 'kiosk',
            'metadata' => ['service_type' => $queue->service_type, 'layanan_id' => $queue->layanan_id],
        ]);

        try {
            broadcast(new \App\Events\QueueCreated($queue));
        } catch (\Throwable $e) {
            Log::warning('Broadcast failed: ' . $e->getMessage());
        }

        return response()->json([
            'data' => $queue->load('counter', 'layanan'),
            'message' => 'Queue ticket created successfully',
        ], 201);
    }

    public function show(Queue $queue): JsonResponse
    {
        return response()->json([
            'data' => $queue->load('counter', 'logs'),
        ]);
    }

    public function call(Request $request, Queue $queue): JsonResponse
    {
        $user = $request->user();

        // Validate user can call for this counter
        if ($user->isLoket() && $queue->counter_id !== $user->counter_id) {
            // Check if user has this counter in assigned counters
            if (!$user->assignedCounters()->where('counter_id', $queue->counter_id)->exists()) {
                return response()->json([
                    'message' => 'You are not authorized to call this queue',
                ], 403);
            }
        }

        if (!$queue->isWaiting()) {
            return response()->json([
                'message' => 'Queue is not in waiting status',
            ], 400);
        }

        if (!$queue->created_at->isToday()) {
            return response()->json([
                'message' => 'Queue is not from today',
            ], 422);
        }

        $counterId = $user->counter_id ?? $request->counter_id;

        $queue->call($user->name, $counterId);

        // Log the action
        QueueLog::create([
            'queue_id' => $queue->id,
            'action' => 'called',
            'performed_by' => $user->name,
            'metadata' => ['counter_id' => $counterId],
        ]);

        // Audit log
        AuditLog::log(
            action: 'call',
            model: 'Queue',
            modelId: $queue->id,
            changes: ['status' => ['from' => 'waiting', 'to' => 'called']],
            ipAddress: $request->ip(),
            userId: $user->id
        );

        // Broadcast event
        try {
            broadcast(new \App\Events\QueueCalled($queue));
        } catch (\Throwable $e) {
            Log::warning('Broadcast failed: ' . $e->getMessage());
        }

        return response()->json([
            'data' => $queue->load('counter'),
            'message' => 'Queue called successfully',
        ]);
    }

    public function recall(Request $request, Queue $queue): JsonResponse
    {
        $user = $request->user();

        if (!$this->canOperateOnCounter($user, $queue->counter_id)) {
            return response()->json([
                'message' => 'You are not authorized to recall this queue',
            ], 403);
        }

        if (!$queue->created_at->isToday()) {
            return response()->json([
                'message' => 'Queue is not from today',
            ], 422);
        }

        if (!$queue->isCalled() && !$queue->isServing() && !$queue->isSkipped()) {
            return response()->json([
                'message' => 'Queue is not in called, serving, or skipped status',
            ], 400);
        }

        $counterId = $user->counter_id ?? $queue->counter_id;

        $queue->call($user->name, $counterId);

        // Log the action
        QueueLog::create([
            'queue_id' => $queue->id,
            'action' => 'recalled',
            'performed_by' => $user->name,
            'metadata' => ['counter_id' => $counterId],
        ]);

        // Audit log
        AuditLog::log(
            action: 'recall',
            model: 'Queue',
            modelId: $queue->id,
            changes: ['status' => ['from' => $queue->getOriginal('status'), 'to' => 'called']],
            ipAddress: $request->ip(),
            userId: $user->id
        );

        // Broadcast event
        try {
            broadcast(new \App\Events\QueueCalled($queue));
        } catch (\Throwable $e) {
            Log::warning('Broadcast failed: ' . $e->getMessage());
        }

        return response()->json([
            'data' => $queue->load('counter'),
            'message' => 'Queue recalled successfully',
        ]);
    }

    public function complete(Request $request, Queue $queue): JsonResponse
    {
        try {
            $user = $request->user();

            if (!$this->canOperateOnCounter($user, $queue->counter_id)) {
                return response()->json([
                    'message' => 'You are not authorized to complete this queue',
                ], 403);
            }

            if (!$queue->isCalled() && !$queue->isServing()) {
                return response()->json([
                    'message' => 'Queue is not in called or serving status',
                ], 400);
            }

            $queue = DB::transaction(function () use ($queue, $request, $user) {
                $queue = Queue::whereKey($queue->id)->lockForUpdate()->firstOrFail();

                if (!$queue->isCalled() && !$queue->isServing()) {
                    return null;
                }

                $previousStatus = $queue->status;
                $queue->complete();

                QueueLog::create([
                    'queue_id' => $queue->id,
                    'action' => 'completed',
                    'performed_by' => $user->name,
                    'metadata' => ['duration_seconds' => $queue->called_at ? now()->diffInSeconds($queue->called_at) : null],
                ]);

                AuditLog::log(
                    action: 'complete',
                    model: 'Queue',
                    modelId: $queue->id,
                    changes: ['status' => ['from' => $previousStatus, 'to' => 'completed']],
                    ipAddress: $request->ip(),
                    userId: $user->id
                );

                return $queue->load('counter', 'layanan');
            });

            if (!$queue) {
                return response()->json([
                    'message' => 'Queue is not in called or serving status',
                ], 400);
            }

            try {
                broadcast(new \App\Events\QueueCompleted($queue));
            } catch (\Throwable $e) {
                Log::warning('Broadcast failed: ' . $e->getMessage());
            }

            return response()->json([
                'data' => $queue,
                'message' => 'Queue completed successfully',
            ]);
        } catch (\Throwable $e) {
            Log::error('Complete queue failed', [
                'queue_id' => $queue->id ?? null,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            return response()->json([
                'message' => 'Failed to complete queue: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function skip(Request $request, Queue $queue): JsonResponse
    {
        $user = $request->user();

        if (!$this->canOperateOnCounter($user, $queue->counter_id)) {
            return response()->json([
                'message' => 'You are not authorized to skip this queue',
            ], 403);
        }

        if (!$queue->isWaiting() && !$queue->isCalled()) {
            return response()->json([
                'message' => 'Queue cannot be skipped in current status',
            ], 400);
        }

        $previousStatus = $queue->status;
        $queue->skip();

        // Log the action
        QueueLog::create([
            'queue_id' => $queue->id,
            'action' => 'skipped',
            'performed_by' => $user->name,
        ]);

        // Audit log
        AuditLog::log(
            action: 'skip',
            model: 'Queue',
            modelId: $queue->id,
            changes: ['status' => ['from' => $previousStatus, 'to' => 'skipped']],
            ipAddress: $request->ip(),
            userId: $user->id
        );

        // Broadcast event
        try {
            broadcast(new \App\Events\QueueSkipped($queue));
        } catch (\Throwable $e) {
            Log::warning('Broadcast failed: ' . $e->getMessage());
        }

        return response()->json([
            'data' => $queue->load('counter'),
            'message' => 'Queue skipped successfully',
        ]);
    }

    public function callNext(Request $request, $counterId): JsonResponse
    {
        $user = $request->user();
        $counterId = (int) $counterId;

        if (!$this->canOperateOnCounter($user, $counterId)) {
            return response()->json([
                'message' => 'You are not authorized to call queues for this counter',
            ], 403);
        }

        $counter = \App\Models\Counter::with('layanan')->find($counterId);

        if (!$counter) {
            return response()->json([
                'message' => 'Counter not found',
            ], 404);
        }

        // Build query: only waiting queues
        $query = Queue::where('status', 'waiting')
            ->whereDate('created_at', today());

        if ($counter->layanan_id) {
            $query->where('layanan_id', $counter->layanan_id);
        } else {
            // Counter has no layanan → call queues for this counter or unassigned
            $query->where(fn($q) => $q
                ->where('counter_id', $counterId)
                ->orWhereNull('counter_id')
            );
        }

        $queue = DB::transaction(function () use ($query, $user, $counterId, $request) {
            $queue = $query->lockForUpdate()->orderBy('created_at')->first();

            if (!$queue) {
                return null;
            }

            $queue->call($user->name, $counterId);

            QueueLog::create([
                'queue_id' => $queue->id,
                'action' => 'called',
                'performed_by' => $user->name,
                'metadata' => ['counter_id' => $counterId],
            ]);

            AuditLog::log(
                action: 'call_next',
                model: 'Queue',
                modelId: $queue->id,
                changes: ['status' => ['from' => 'waiting', 'to' => 'called']],
                ipAddress: $request->ip(),
                userId: $user->id
            );

            return $queue->load('counter', 'layanan');
        });

        if (!$queue) {
            return response()->json([
                'message' => 'No waiting queue found',
            ], 404);
        }

        try {
            broadcast(new \App\Events\QueueCalled($queue));
        } catch (\Throwable $e) {
            Log::warning('Broadcast failed: ' . $e->getMessage());
        }

        return response()->json([
            'data' => $queue,
            'message' => 'Next queue called successfully',
        ]);
    }

    public function stats(): JsonResponse
    {
        $today = today();

        $stats = [
            'active_queues' => Queue::whereIn('status', ['waiting', 'called', 'serving'])->count(),
            'waiting' => Queue::where('status', 'waiting')->count(),
            'called' => Queue::where('status', 'called')->count(),
            'serving' => Queue::where('status', 'serving')->count(),
            'completed_today' => Queue::where('status', 'completed')
                ->whereDate('completed_at', $today)
                ->count(),
            'avg_wait_minutes' => $this->calculateAvgWaitMinutes(),
        ];

        return response()->json(['data' => $stats]);
    }

    protected function generateTicketNumber(?int $layananId = null): string
    {
        $prefix = 'A';
        $query = Queue::whereDate('created_at', today());

        if ($layananId) {
            $layanan = \App\Models\Layanan::find($layananId);
            if ($layanan) {
                $prefix = strtoupper(substr($layanan->code, 0, 3));
            }
            $query->where('layanan_id', $layananId);
        }

        $lastQueue = $query->orderBy('id', 'desc')->first();

        if ($lastQueue && preg_match('/(\d+)$/', $lastQueue->ticket_number, $matches)) {
            $sequence = (int) $matches[1] + 1;
        } else {
            $sequence = 1;
        }

        return $prefix . str_pad($sequence, 3, '0', STR_PAD_LEFT);
    }

    protected function calculateAvgWaitMinutes(): float
    {
        $completedToday = Queue::where('status', 'completed')
            ->whereDate('completed_at', today())
            ->whereNotNull('called_at')
            ->get();

        if ($completedToday->isEmpty()) {
            return 0;
        }

        $totalMinutes = $completedToday->sum(fn($q) => $q->called_at->diffInMinutes($q->created_at));
        
        return round($totalMinutes / $completedToday->count(), 1);
    }

    protected function canOperateOnCounter(User $user, ?int $counterId): bool
    {
        if ($user->isAdmin() || $user->isSuper()) {
            return true;
        }

        if (!$user->isLoket()) {
            return false;
        }

        if ($counterId === null) {
            return true;
        }

        if ((int) $counterId === (int) $user->counter_id) {
            return true;
        }

        return $user->assignedCounters()->where('counter_id', $counterId)->exists();
    }
}