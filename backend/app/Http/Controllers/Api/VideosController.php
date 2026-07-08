<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Video;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\Process\Process;

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
            'video' => 'required|file|mimes:mp4,webm,avi,mov,mkv|max:1048576',
            'title' => 'required|string|max:255',
            'duration' => 'nullable|integer',
            'volume_level' => 'nullable|numeric|min:0|max:1',
            'is_active' => 'sometimes|boolean',
            'playlist_order' => 'nullable|integer',
        ]);

        $path = $request->file('video')->store('videos', 'public');
        $fileUrl = "/storage/{$path}";

        $duration = $request->duration ?? $this->extractDuration(storage_path("app/public/{$path}"));

        $video = Video::create([
            'display_id' => $request->display_id,
            'file_url' => $fileUrl,
            'title' => $request->title,
            'duration' => $duration,
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
            'video' => 'sometimes|file|mimes:mp4,webm,avi,mov,mkv|max:1048576',
            'file_url' => 'sometimes|url',
            'title' => 'sometimes|string|max:255',
            'duration' => 'nullable|integer',
            'volume_level' => 'nullable|numeric|min:0|max:1',
            'is_active' => 'sometimes|boolean',
            'playlist_order' => 'nullable|integer',
        ]);

        $updateData = $request->only([
            'file_url', 'title', 'duration', 'volume_level', 'is_active', 'playlist_order'
        ]);

        if ($request->hasFile('video')) {
            $path = $request->file('video')->store('videos', 'public');
            $updateData['file_url'] = "/storage/{$path}";
            $updateData['duration'] = $request->duration ?? $this->extractDuration(storage_path("app/public/{$path}"));
        }

        $video->update($updateData);

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

        // Delete the file from storage if it's a local file
        if ($video->file_url && str_starts_with($video->file_url, '/storage/')) {
            $relativePath = str_replace('/storage/', '', $video->file_url);
            \Illuminate\Support\Facades\Storage::disk('public')->delete($relativePath);
        }

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

    protected function extractDuration(string $filePath): ?int
    {
        if (!file_exists($filePath)) {
            return null;
        }

        $candidates = ['/usr/local/bin/ffprobe', '/usr/bin/ffprobe', '/opt/homebrew/bin/ffprobe'];
        $ffprobe = null;
        foreach ($candidates as $path) {
            if (file_exists($path) && is_executable($path)) {
                $ffprobe = $path;
                break;
            }
        }

        if ($ffprobe === null) {
            return null;
        }

        $process = new Process([$ffprobe, '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', $filePath]);
        $process->run();

        $output = trim($process->getOutput());

        if (is_numeric($output)) {
            return (int) round((float) $output);
        }

        return null;
    }
}
