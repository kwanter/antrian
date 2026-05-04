<?php

namespace App\Http\Controllers\Api;

use App\Events\VolumeUpdate;
use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Display;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DisplaysController extends Controller
{
    public function index(): JsonResponse
    {
        $displays = Display::with('activeVideos')->get();

        return response()->json([
            'data' => $displays,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'name' => 'required|string|max:100',
            'location' => 'required|string|max:255',
            'is_active' => 'sometimes|boolean',
            'settings' => 'nullable|array',
        ]);

        $display = Display::create([
            'name' => $request->name,
            'location' => $request->location,
            'is_active' => $request->boolean('is_active', true),
            'settings' => $request->settings,
        ]);

        AuditLog::log(
            action: 'create',
            model: 'Display',
            modelId: $display->id,
            changes: $display->toArray(),
            ipAddress: $request->ip(),
            userId: $request->user()?->id
        );

        return response()->json([
            'data' => $display,
            'message' => 'Display created successfully',
        ], 201);
    }

    public function show(Display $display): JsonResponse
    {
        return response()->json([
            'data' => $display->load('videos'),
        ]);
    }

    public function update(Request $request, Display $display): JsonResponse
    {
        $oldData = $display->toArray();

        $request->validate([
            'name' => 'sometimes|string|max:100',
            'location' => 'sometimes|string|max:255',
            'is_active' => 'sometimes|boolean',
            'settings' => 'nullable|array',
        ]);

        $display->update($request->only(['name', 'location', 'is_active', 'settings']));

        AuditLog::log(
            action: 'update',
            model: 'Display',
            modelId: $display->id,
            changes: ['before' => $oldData, 'after' => $display->toArray()],
            ipAddress: $request->ip(),
            userId: $request->user()?->id
        );

        return response()->json([
            'data' => $display,
            'message' => 'Display updated successfully',
        ]);
    }

    public function destroy(Request $request, Display $display): JsonResponse
    {
        $oldData = $display->toArray();
        $display->delete();

        AuditLog::log(
            action: 'delete',
            model: 'Display',
            modelId: $display->id,
            changes: $oldData,
            ipAddress: $request->ip(),
            userId: $request->user()?->id
        );

        return response()->json([
            'message' => 'Display deleted successfully',
        ]);
    }

    public function sync(Display $display): JsonResponse
    {
        // Return current queue state for display sync
        $currentQueue = \App\Models\Queue::whereIn('status', ['called', 'serving'])
            ->where('counter_id', $display->settings['counter_id'] ?? null)
            ->orderBy('called_at', 'desc')
            ->first();

        $recentQueues = \App\Models\Queue::whereIn('status', ['waiting', 'called'])
            ->whereDate('created_at', today())
            ->orderBy('created_at', 'desc')
            ->limit(10)
            ->get();

        $activeVideo = $display->activeVideos()->first();

        return response()->json([
            'data' => [
                'current_queue' => $currentQueue?->load('counter'),
                'recent_queues' => $recentQueues->load('counter'),
                'video_settings' => [
                    'volume' => $activeVideo?->volume_level ?? 1.0,
                    'video_id' => $activeVideo?->id,
                    'video_url' => $activeVideo?->file_url,
                ],
            ],
        ]);
    }

    public function updateVolume(Request $request, Display $display): JsonResponse
    {
        $request->validate([
            'volume' => 'required|numeric|min:0|max:1',
            'video_id' => 'nullable|exists:videos,id',
        ]);

        // Broadcast volume update
        event(new VolumeUpdate(
            displayId: $display->id,
            volume: $request->volume,
            videoId: $request->video_id
        ));

        AuditLog::log(
            action: 'volume_update',
            model: 'Display',
            modelId: $display->id,
            changes: ['volume' => $request->volume, 'video_id' => $request->video_id],
            ipAddress: $request->ip(),
            userId: $request->user()?->id
        );

        return response()->json([
            'message' => 'Volume updated successfully',
        ]);
    }
}