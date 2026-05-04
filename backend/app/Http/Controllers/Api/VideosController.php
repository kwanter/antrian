<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Video;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VideosController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Video::with('display');

        if ($request->has('display_id')) {
            $query->where('display_id', $request->display_id);
        }

        if ($request->has('is_active')) {
            $query->where('is_active', $request->boolean('is_active'));
        }

        $videos = $query->orderBy('playlist_order')->get();

        return response()->json([
            'data' => $videos,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'display_id' => 'required|exists:displays,id',
            'file_url' => 'required|url',
            'title' => 'required|string|max:255',
            'duration' => 'nullable|integer',
            'volume_level' => 'nullable|numeric|min:0|max:1',
            'is_active' => 'sometimes|boolean',
            'playlist_order' => 'nullable|integer',
        ]);

        $video = Video::create([
            'display_id' => $request->display_id,
            'file_url' => $request->file_url,
            'title' => $request->title,
            'duration' => $request->duration,
            'volume_level' => $request->volume_level ?? 1.0,
            'is_active' => $request->boolean('is_active', true),
            'playlist_order' => $request->playlist_order ?? 0,
        ]);

        AuditLog::log(
            action: 'create',
            model: 'Video',
            modelId: $video->id,
            changes: $video->toArray(),
            ipAddress: $request->ip(),
            userId: $request->user()?->id
        );

        return response()->json([
            'data' => $video,
            'message' => 'Video created successfully',
        ], 201);
    }

    public function show(Video $video): JsonResponse
    {
        return response()->json([
            'data' => $video->load('display'),
        ]);
    }

    public function update(Request $request, Video $video): JsonResponse
    {
        $oldData = $video->toArray();

        $request->validate([
            'file_url' => 'sometimes|url',
            'title' => 'sometimes|string|max:255',
            'duration' => 'nullable|integer',
            'volume_level' => 'nullable|numeric|min:0|max:1',
            'is_active' => 'sometimes|boolean',
            'playlist_order' => 'nullable|integer',
        ]);

        $video->update($request->only([
            'file_url', 'title', 'duration', 'volume_level', 'is_active', 'playlist_order'
        ]));

        AuditLog::log(
            action: 'update',
            model: 'Video',
            modelId: $video->id,
            changes: ['before' => $oldData, 'after' => $video->toArray()],
            ipAddress: $request->ip(),
            userId: $request->user()?->id
        );

        return response()->json([
            'data' => $video,
            'message' => 'Video updated successfully',
        ]);
    }

    public function destroy(Request $request, Video $video): JsonResponse
    {
        $oldData = $video->toArray();
        $video->delete();

        AuditLog::log(
            action: 'delete',
            model: 'Video',
            modelId: $video->id,
            changes: $oldData,
            ipAddress: $request->ip(),
            userId: $request->user()?->id
        );

        return response()->json([
            'message' => 'Video deleted successfully',
        ]);
    }

    public function reorder(Request $request): JsonResponse
    {
        $request->validate([
            'order' => 'required|array',
            'order.*.id' => 'required|exists:videos,id',
            'order.*.playlist_order' => 'required|integer',
        ]);

        foreach ($request->order as $item) {
            Video::where('id', $item['id'])->update(['playlist_order' => $item['playlist_order']]);
        }

        return response()->json([
            'message' => 'Video order updated successfully',
        ]);
    }
}