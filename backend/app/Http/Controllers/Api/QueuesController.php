<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreQueueRequest;
use App\Models\Queue;
use App\Services\Exceptions\QueueLifecycleException;
use App\Services\QueueLifecycleService;
use App\Services\QueueQueryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class QueuesController extends Controller
{
    public function __construct(
        private readonly QueueLifecycleService $lifecycle,
        private readonly QueueQueryService $queries,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $queues = $this->queries->list(
            $request->user(),
            $request->only(['status', 'service_type', 'date', 'counter_id', 'layanan_id', 'per_page']),
        );

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
        $queue = $this->lifecycle->store($request->validated());

        // F-09: public creation echo uses PublicQueueResource, which drops
        // customer_name / customer_phone from the response.
        return response()->json([
            'data' => new \App\Http\Resources\PublicQueueResource($queue),
            'message' => 'Queue ticket created successfully',
        ], 201);
    }

    public function show(Queue $queue, Request $request): JsonResponse
    {
        $user = $request->user();

        // Enforce scope for loket users: must be assigned to queue's counter
        if ($user && $user->isLoket()) {
            if (! $this->lifecycle->canOperateOnCounter($user, $queue->counter_id)) {
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
            // Unexpected failures (DB, lock, broadcast wiring) surface as a
            // generic 500. Full detail is logged server-side; the response
            // message must not echo exception internals (F-33).
            Log::error('Complete queue failed', [
                'queue_id' => $queue->id ?? null,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json([
                'message' => 'Failed to complete queue.',
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
        return response()->json(['data' => $this->queries->stats()]);
    }
}
