<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\LayananRequest;
use App\Models\AuditLog;
use App\Models\Layanan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LayananController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Layanan::with('counter');

        if ($request->boolean('active_only', true)) {
            $query->where('is_active', true);
        }

        $layanans = $query->orderBy('name')->get();

        return response()->json([
            'data' => $layanans,
            'message' => 'Layanan retrieved successfully',
        ]);
    }

    public function store(LayananRequest $request): JsonResponse
    {
        $data = $request->validated();

        if (isset($data['counter_id'])) {
            $existingLayanan = Layanan::where('counter_id', $data['counter_id'])->first();
            if ($existingLayanan) {
                return response()->json([
                    'message' => 'Counter sudah memiliki layanan lain',
                ], 422);
            }
        }

        $layanan = Layanan::create($data);

        AuditLog::create([
            'user_id' => $request->user()->id,
            'action' => 'create',
            'model' => 'Layanan',
            'model_id' => $layanan->id,
            'changes' => $layanan->toArray(),
        ]);

        return response()->json([
            'data' => $layanan->load('counter'),
            'message' => 'Layanan created successfully',
        ], 201);
    }

    public function show(Layanan $layanan): JsonResponse
    {
        return response()->json([
            'data' => $layanan->load('counter'),
            'message' => 'Layanan retrieved successfully',
        ]);
    }

    public function update(LayananRequest $request, Layanan $layanan): JsonResponse
    {
        $data = $request->validated();

        if (isset($data['counter_id']) && $data['counter_id'] !== $layanan->counter_id) {
            $existingLayanan = Layanan::where('counter_id', $data['counter_id'])
                ->where('id', '!=', $layanan->id)
                ->first();
            if ($existingLayanan) {
                return response()->json([
                    'message' => 'Counter sudah memiliki layanan lain',
                ], 422);
            }
        }

        $layanan->update($data);

        AuditLog::create([
            'user_id' => $request->user()->id,
            'action' => 'update',
            'model' => 'Layanan',
            'model_id' => $layanan->id,
            'changes' => $layanan->toArray(),
        ]);

        return response()->json([
            'data' => $layanan->load('counter'),
            'message' => 'Layanan updated successfully',
        ]);
    }

    public function destroy(Request $request, Layanan $layanan): JsonResponse
    {
        $layanan->update(['is_active' => false]);

        AuditLog::create([
            'user_id' => $request->user()->id,
            'action' => 'deactivate',
            'model' => 'Layanan',
            'model_id' => $layanan->id,
            'changes' => ['name' => $layanan->name],
        ]);

        return response()->json([
            'data' => $layanan->load('counter'),
            'message' => 'Layanan deactivated successfully',
        ]);
    }

    public function queues(Request $request, Layanan $layanan): JsonResponse
    {
        $request->validate([
            'status' => 'sometimes|string',
            'date' => 'sometimes|date_format:Y-m-d',
            'counter_id' => 'sometimes|integer|exists:counters,id',
        ]);

        $query = $layanan->queues()
            ->with('counter');

        $allowedStatuses = ['called', 'serving', 'completed'];
        $statuses = $request->filled('status')
            ? array_values(array_intersect(array_filter(explode(',', (string) $request->query('status'))), $allowedStatuses))
            : ['called', 'serving'];

        if ($statuses === []) {
            $query->whereRaw('1 = 0');
        } else {
            $query->whereIn('status', $statuses);
        }

        $query->whereDate('created_at', $request->query('date', today()->toDateString()));

        if ($request->filled('counter_id')) {
            $query->where('counter_id', $request->integer('counter_id'));
        }

        $queues = $query
            ->orderBy('created_at', 'desc')
            ->paginate(50);

        return response()->json([
            'data' => collect($queues->items())->map(fn($queue) => [
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
        ]);
    }
}
