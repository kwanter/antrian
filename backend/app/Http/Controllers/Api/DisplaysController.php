<?php

namespace App\Http\Controllers\Api;

use App\Events\VolumeUpdate;
use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Display;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

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
            'settings' => 'sometimes|array',
        ]);

        $display = Display::create([
            'name' => $request->name,
            'location' => $request->location,
            'is_active' => $request->boolean('is_active', true),
            'settings' => $request->input('settings', []),
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
            'settings' => 'sometimes|array',
            'settings.volume' => 'sometimes|numeric|min:0|max:1',
            'settings.counter_id' => 'sometimes|nullable|exists:counters,id',
        ]);

        $updateData = $request->only(['name', 'location', 'is_active']);

        if ($request->has('settings')) {
            $settings = array_intersect_key($request->input('settings', []), array_flip(['volume', 'counter_id']));
            $updateData['settings'] = array_merge($display->settings ?? [], $settings);
        }

        $display->update($updateData);

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
        $currentQueue = \App\Models\Queue::whereIn('status', ['called', 'serving'])
            ->where('counter_id', $display->settings['counter_id'] ?? null)
            ->whereDate('created_at', today())
            ->orderBy('called_at', 'desc')
            ->first();

        $recentQueues = \App\Models\Queue::where('status', 'called')
            ->where('counter_id', $display->settings['counter_id'] ?? null)
            ->whereDate('created_at', today())
            ->when($currentQueue, fn($query) => $query->where('id', '!=', $currentQueue->id))
            ->orderBy('called_at', 'desc')
            ->limit(10)
            ->get();

        $activeVideo = $display->activeVideos()->first();

        return response()->json([
            'data' => [
                'current_queue' => $currentQueue?->load('counter'),
                'recent_queues' => $recentQueues->load('counter'),
                'video_settings' => [
                    'volume' => $display->settings['volume'] ?? $activeVideo?->volume_level ?? 1.0,
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

        $volume = (float) $request->volume;
        $settings = $display->settings ?? [];
        $settings['volume'] = $volume;
        $display->update(['settings' => $settings]);

        event(new VolumeUpdate(
            displayId: $display->id,
            volume: $volume,
            videoId: $request->video_id
        ));

        AuditLog::log(
            action: 'volume_update',
            model: 'Display',
            modelId: $display->id,
            changes: ['volume' => $volume, 'video_id' => $request->video_id],
            ipAddress: $request->ip(),
            userId: $request->user()?->id
        );

        return response()->json([
            'message' => 'Volume updated successfully',
            'data' => $display->fresh(),
        ]);
    }

    public function updateAnnouncer(Request $request, Display $display): JsonResponse
    {
        $request->validate([
            'announcer_enabled' => 'sometimes|boolean',
            'announcer_volume' => 'sometimes|numeric|min:0|max:1',
            'announcer_sound' => 'nullable|file|mimes:mp3,wav,ogg,m4a,aac|max:10240',
            'clear_sound' => 'sometimes|boolean',
        ]);

        $settings = $display->settings ?? [];
        $previousSoundUrl = $settings['announcer_sound_url'] ?? null;
        $shouldDeletePreviousSound = $request->boolean('clear_sound') || $request->hasFile('announcer_sound');

        if ($request->has('announcer_enabled')) {
            $settings['announcer_enabled'] = $request->boolean('announcer_enabled');
        }

        if ($request->has('announcer_volume')) {
            $settings['announcer_volume'] = (float) $request->announcer_volume;
        }

        if ($request->boolean('clear_sound')) {
            $settings['announcer_sound_url'] = null;
            $settings['announcer_sound_title'] = null;
        }

        if ($request->hasFile('announcer_sound')) {
            $path = $request->file('announcer_sound')->store('announcers', 'public');
            $settings['announcer_sound_url'] = "/storage/{$path}";
            $settings['announcer_sound_title'] = $request->file('announcer_sound')->getClientOriginalName();
        }

        $display->update(['settings' => $settings]);
        $updatedDisplay = $display->fresh();

        if ($shouldDeletePreviousSound && is_string($previousSoundUrl) && str_starts_with($previousSoundUrl, '/storage/announcers/')) {
            Storage::disk('public')->delete(str_replace('/storage/', '', $previousSoundUrl));
        }

        event(new VolumeUpdate(
            displayId: $display->id,
            volume: (float) ($settings['volume'] ?? 1.0),
            settings: $settings
        ));

        AuditLog::log(
            action: 'announcer_update',
            model: 'Display',
            modelId: $display->id,
            changes: ['settings' => $settings],
            ipAddress: $request->ip(),
            userId: $request->user()?->id
        );

        return response()->json([
            'message' => 'Announcer settings updated successfully',
            'data' => $updatedDisplay,
        ]);
    }
}