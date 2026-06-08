<?php

namespace App\Http\Controllers\Api;

use App\Events\QueueCreated;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreQueueRequest;
use App\Models\Counter;
use App\Models\Layanan;
use App\Models\Queue;
use App\Models\QueueLog;
use App\Models\User;
use App\Services\Exceptions\QueueLifecycleException;
use App\Services\QueueLifecycleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class QueuesController extends Controller
{
    public function __construct(
        private readonly QueueLifecycleService $lifecycle,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = Queue::with('counter')->latest();

        // Enforce scope for loket users: only their assigned counter's queues
        if ($user && ($user->isLoket())) {
            $scopedCounterId = $user->counter_id;
            $scopedLayananId = null;

            if ($scopedCounterId) {
                $counter = Counter::find($scopedCounterId);
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
            $layanan = Layanan::with('counter')->find($request->layanan_id);
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
            broadcast(new QueueCreated($queue));
        } catch (\Throwable $e) {
            Log::warning('Broadcast failed: '.$e->getMessage());
        }

        return response()->json([
            'data' => $queue->load('counter', 'layanan'),
            'message' => 'Queue ticket created successfully',
        ], 201);
    }

    public function show(Queue $queue, Request $request): JsonResponse
    {
        $user = $request->user();

        // Enforce scope for loket users: must be assigned to queue's counter
        if ($user && $user->isLoket()) {
            if (! $this->canOperateOnCounter($user, $queue->counter_id)) {
                return response()->json([
                    'message' => 'You are not authorized to view this queue',
                ], 403);
            }
        }

        return response()->json([
            'data' => $queue->load('counter', 'logs'),
        ]);
    }

    public function call(Request $request, Queue $queue): JsonResponse
    {
        $user = $request->user();
        $auditUserId = $request->session()->get('impersonator_id') ?? $user->id;

        try {
            $queue = $this->lifecycle->call(
                queue: $queue,
                actor: $user,
                counterIdOverride: $request->integer('counter_id') ?: null,
                auditUserId: (int) $auditUserId,
                ipAddress: $request->ip(),
            );
        } catch (QueueLifecycleException $e) {
            return response()->json([
                'code' => $e->errorCode(),
                'message' => $e->getMessage(),
            ], $e->statusCode());
        }

        return response()->json([
            'data' => $queue,
            'message' => 'Queue called successfully',
        ]);
    }

    public function recall(Request $request, Queue $queue): JsonResponse
    {
        $user = $request->user();

        // If an admin is previewing as loket, credit the audit log to the
        // real admin (impersonation pitfall #19), not the impersonated user.
        $auditUserId = $request->session()->get('impersonator_id') ?? $user->id;

        try {
            $queue = $this->lifecycle->recall(
                queue: $queue,
                actor: $user,
                auditUserId: (int) $auditUserId,
                ipAddress: $request->ip(),
            );
        } catch (QueueLifecycleException $e) {
            return response()->json([
                'code' => $e->errorCode(),
                'message' => $e->getMessage(),
            ], $e->statusCode());
        }

        return response()->json([
            'data' => $queue,
            'message' => 'Queue recalled successfully',
        ]);
    }

    public function complete(Request $request, Queue $queue): JsonResponse
    {
        $user = $request->user();
        $auditUserId = $request->session()->get('impersonator_id') ?? $user->id;

        try {
            $queue = $this->lifecycle->complete(
                queue: $queue,
                actor: $user,
                auditUserId: (int) $auditUserId,
                ipAddress: $request->ip(),
            );
        } catch (QueueLifecycleException $e) {
            return response()->json([
                'code' => $e->errorCode(),
                'message' => $e->getMessage(),
            ], $e->statusCode());
        } catch (\Throwable $e) {
            // Preserve the original catch-all: unexpected failures (DB, lock,
            // broadcast wiring) surface as a 500 rather than leaking a stack trace.
            Log::error('Complete queue failed', [
                'queue_id' => $queue->id ?? null,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json([
                'message' => 'Failed to complete queue: '.$e->getMessage(),
            ], 500);
        }

        return response()->json([
            'data' => $queue,
            'message' => 'Queue completed successfully',
        ]);
    }

    public function skip(Request $request, Queue $queue): JsonResponse
    {
        $user = $request->user();

        // If an admin is previewing as loket, credit the audit log to the
        // real admin (impersonation pitfall #19), not the impersonated user.
        $auditUserId = $request->session()->get('impersonator_id') ?? $user->id;

        try {
            $queue = $this->lifecycle->skip(
                queue: $queue,
                actor: $user,
                auditUserId: (int) $auditUserId,
                ipAddress: $request->ip(),
            );
        } catch (QueueLifecycleException $e) {
            return response()->json([
                'code' => $e->errorCode(),
                'message' => $e->getMessage(),
            ], $e->statusCode());
        }

        return response()->json([
            'data' => $queue,
            'message' => 'Queue skipped successfully',
        ]);
    }

    public function callNext(Request $request, $counterId): JsonResponse
    {
        $user = $request->user();
        $auditUserId = $request->session()->get('impersonator_id') ?? $user->id;

        try {
            $queue = $this->lifecycle->callNext(
                counterId: (int) $counterId,
                actor: $user,
                auditUserId: (int) $auditUserId,
                ipAddress: $request->ip(),
            );
        } catch (QueueLifecycleException $e) {
            return response()->json([
                'code' => $e->errorCode(),
                'message' => $e->getMessage(),
            ], $e->statusCode());
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
            $layanan = Layanan::find($layananId);
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

        return $prefix.str_pad($sequence, 3, '0', STR_PAD_LEFT);
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

        $totalMinutes = $completedToday->sum(fn ($q) => $q->called_at->diffInMinutes($q->created_at));

        return round($totalMinutes / $completedToday->count(), 1);
    }

    protected function canOperateOnCounter(User $user, ?int $counterId): bool
    {
        if ($user->isAdmin() || $user->isSuper()) {
            return true;
        }

        if (! $user->isLoket()) {
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
