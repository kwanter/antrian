<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreQueueRequest;
use App\Models\AuditLog;
use App\Models\Queue;
use App\Models\QueueLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class QueuesController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Queue::with('counter')->latest();

        // Filter by status
        if ($request->has('status')) {
            $query->where('status', $request->status);
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
        // Generate ticket number
        $ticketNumber = $this->generateTicketNumber();

        $queue = Queue::create([
            'ticket_number' => $ticketNumber,
            'service_type' => $request->service_type,
            'customer_name' => $request->customer_name,
            'customer_phone' => $request->customer_phone,
            'status' => 'waiting',
        ]);

        // Log the action
        QueueLog::create([
            'queue_id' => $queue->id,
            'action' => 'created',
            'performed_by' => 'kiosk',
            'metadata' => ['service_type' => $queue->service_type],
        ]);

        // Broadcast event
        broadcast(new \App\Events\QueueCreated($queue));

        return response()->json([
            'data' => $queue->load('counter'),
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
            \Log::warning('Broadcast failed: ' . $e->getMessage());
        }

        return response()->json([
            'data' => $queue->load('counter'),
            'message' => 'Queue called successfully',
        ]);
    }

    public function recall(Request $request, Queue $queue): JsonResponse
    {
        $user = $request->user();
        $counterId = $user->counter_id ?? $queue->counter_id;

        // Always allow re-calling - update to called status
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
            \Log::warning('Broadcast failed: ' . $e->getMessage());
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

            if (!$queue->isCalled() && !$queue->isServing()) {
                return response()->json([
                    'message' => 'Queue is not in called or serving status',
                ], 400);
            }

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
                changes: ['status' => ['from' => $queue->getOriginal('status'), 'to' => 'completed']],
                ipAddress: $request->ip(),
                userId: $user->id
            );

            try {
                broadcast(new \App\Events\QueueCompleted($queue));
            } catch (\Throwable $e) {
                \Log::warning('Broadcast failed: ' . $e->getMessage());
            }

            return response()->json([
                'data' => $queue->load('counter'),
                'message' => 'Queue completed successfully',
            ]);
        } catch (\Throwable $e) {
            \Log::error('Complete queue failed', [
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
            \Log::warning('Broadcast failed: ' . $e->getMessage());
        }

        return response()->json([
            'data' => $queue->load('counter'),
            'message' => 'Queue skipped successfully',
        ]);
    }

    public function callNext(Request $request, $counterId): JsonResponse
    {
        $user = $request->user();

        // Find next waiting queue
        $queue = Queue::where('status', 'waiting')
            ->whereHas('counter', fn($q) => $q->where('id', $counterId))
            ->orWhereDoesntHave('counter')
            ->orderBy('created_at')
            ->first();

        if (!$queue) {
            return response()->json([
                'message' => 'No waiting queue found',
            ], 404);
        }

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
            action: 'call_next',
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
            \Log::warning('Broadcast failed: ' . $e->getMessage());
        }

        return response()->json([
            'data' => $queue->load('counter'),
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

    protected function generateTicketNumber(): string
    {
        $date = now()->format('ymd');
        $lastQueue = Queue::whereDate('created_at', today())
            ->orderBy('id', 'desc')
            ->first();

        if ($lastQueue && preg_match('/A(\d+)$/', $lastQueue->ticket_number, $matches)) {
            $sequence = (int) $matches[1] + 1;
        } else {
            $sequence = 1;
        }

        return 'A' . str_pad($sequence, 4, '0', STR_PAD_LEFT);
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
}