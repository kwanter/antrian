<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Counter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CountersController extends Controller
{
    public function index(): JsonResponse
    {
        $counters = Counter::with('users')->get();

        return response()->json([
            'data' => $counters,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'name' => 'required|string|max:100',
            'code' => 'required|string|max:20|unique:counters,code',
            'status' => 'sometimes|in:active,inactive',
        ]);

        $counter = Counter::create([
            'name' => $request->name,
            'code' => $request->code,
            'status' => $request->status ?? 'active',
        ]);

        AuditLog::log(
            action: 'create',
            model: 'Counter',
            modelId: $counter->id,
            changes: $counter->toArray(),
            ipAddress: $request->ip(),
            userId: $request->user()?->id
        );

        return response()->json([
            'data' => $counter,
            'message' => 'Counter created successfully',
        ], 201);
    }

    public function show(Counter $counter): JsonResponse
    {
        return response()->json([
            'data' => $counter->load('users'),
        ]);
    }

    public function update(Request $request, Counter $counter): JsonResponse
    {
        $oldData = $counter->toArray();

        $request->validate([
            'name' => 'sometimes|string|max:100',
            'code' => 'sometimes|string|max:20|unique:counters,code,' . $counter->id,
            'status' => 'sometimes|in:active,inactive',
        ]);

        $counter->update($request->only(['name', 'code', 'status']));

        AuditLog::log(
            action: 'update',
            model: 'Counter',
            modelId: $counter->id,
            changes: ['before' => $oldData, 'after' => $counter->toArray()],
            ipAddress: $request->ip(),
            userId: $request->user()?->id
        );

        return response()->json([
            'data' => $counter,
            'message' => 'Counter updated successfully',
        ]);
    }

    public function destroy(Request $request, Counter $counter): JsonResponse
    {
        // Check if counter has active queues
        if ($counter->queues()->whereIn('status', ['waiting', 'called', 'serving'])->exists()) {
            return response()->json([
                'message' => 'Cannot delete counter with active queues',
            ], 400);
        }

        $oldData = $counter->toArray();
        $counter->delete();

        AuditLog::log(
            action: 'delete',
            model: 'Counter',
            modelId: $counter->id,
            changes: $oldData,
            ipAddress: $request->ip(),
            userId: $request->user()?->id
        );

        return response()->json([
            'message' => 'Counter deleted successfully',
        ]);
    }

    public function assignUser(Request $request, Counter $counter): JsonResponse
    {
        $request->validate([
            'user_id' => 'required|exists:users,id',
        ]);

        $counter->users()->syncWithoutDetaching([$request->user_id => ['assigned_at' => now()]]);

        AuditLog::log(
            action: 'assign_user',
            model: 'Counter',
            modelId: $counter->id,
            changes: ['user_id' => $request->user_id, 'counter_id' => $counter->id],
            ipAddress: $request->ip(),
            userId: $request->user()?->id
        );

        return response()->json([
            'message' => 'User assigned to counter successfully',
        ]);
    }

    public function unassignUser(Request $request, Counter $counter): JsonResponse
    {
        $request->validate([
            'user_id' => 'required|exists:users,id',
        ]);

        $counter->users()->detach($request->user_id);

        AuditLog::log(
            action: 'unassign_user',
            model: 'Counter',
            modelId: $counter->id,
            changes: ['user_id' => $request->user_id, 'counter_id' => $counter->id],
            ipAddress: $request->ip(),
            userId: $request->user()?->id
        );

        return response()->json([
            'message' => 'User unassigned from counter successfully',
        ]);
    }

    public function syncUsers(Request $request, Counter $counter): JsonResponse
    {
        $request->validate([
            'user_ids' => 'required|array',
            'user_ids.*' => 'exists:users,id',
        ]);

        $counter->users()->sync(array_keys(array_flip($request->user_ids)));

        AuditLog::log(
            action: 'sync_users',
            model: 'Counter',
            modelId: $counter->id,
            changes: ['user_ids' => $request->user_ids],
            ipAddress: $request->ip(),
            userId: $request->user()?->id
        );

        return response()->json([
            'data' => $counter->load('users'),
            'message' => 'Counter users synced successfully',
        ]);
    }
}