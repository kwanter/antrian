<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\KioskStation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class KioskStationsController extends Controller
{
    public function index(): JsonResponse
    {
        $stations = KioskStation::with('printerProfile')->get();

        return response()->json([
            'data' => $stations,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'name' => 'required|string|max:100',
            'printer_profile_id' => 'nullable|exists:printer_profiles,id',
        ]);

        $station = KioskStation::create([
            'name' => $request->name,
            'bridge_token' => Str::random(64),
            'status' => 'offline',
            'printer_profile_id' => $request->printer_profile_id,
        ]);

        AuditLog::log(
            action: 'create',
            model: 'KioskStation',
            modelId: $station->id,
            changes: ['name' => $station->name, 'bridge_token' => '(hidden)'],
            ipAddress: $request->ip(),
            userId: $request->user()?->id
        );

        return response()->json([
            'data' => $station,
            'message' => 'Kiosk station created successfully',
        ], 201);
    }

    public function show(KioskStation $kioskStation): JsonResponse
    {
        return response()->json([
            'data' => $kioskStation->load('printerProfile'),
        ]);
    }

    public function update(Request $request, KioskStation $kioskStation): JsonResponse
    {
        $oldData = $kioskStation->toArray();

        $request->validate([
            'name' => 'sometimes|string|max:100',
            'printer_profile_id' => 'nullable|exists:printer_profiles,id',
        ]);

        $kioskStation->update($request->only(['name', 'printer_profile_id']));

        AuditLog::log(
            action: 'update',
            model: 'KioskStation',
            modelId: $kioskStation->id,
            changes: ['before' => $oldData, 'after' => $kioskStation->toArray()],
            ipAddress: $request->ip(),
            userId: $request->user()?->id
        );

        return response()->json([
            'data' => $kioskStation,
            'message' => 'Kiosk station updated successfully',
        ]);
    }

    public function destroy(Request $request, KioskStation $kioskStation): JsonResponse
    {
        $oldData = $kioskStation->toArray();
        $kioskStation->delete();

        AuditLog::log(
            action: 'delete',
            model: 'KioskStation',
            modelId: $kioskStation->id,
            changes: $oldData,
            ipAddress: $request->ip(),
            userId: $request->user()?->id
        );

        return response()->json([
            'message' => 'Kiosk station deleted successfully',
        ]);
    }

    public function regenerateToken(Request $request, KioskStation $kioskStation): JsonResponse
    {
        $oldToken = $kioskStation->bridge_token;
        $kioskStation->update(['bridge_token' => Str::random(64)]);

        AuditLog::log(
            action: 'regenerate_token',
            model: 'KioskStation',
            modelId: $kioskStation->id,
            changes: ['old_token_preview' => substr($oldToken, 0, 8) . '...'],
            ipAddress: $request->ip(),
            userId: $request->user()?->id
        );

        return response()->json([
            'data' => $kioskStation,
            'message' => 'Token regenerated successfully',
        ]);
    }

    public function heartbeat(KioskStation $kioskStation): JsonResponse
    {
        $kioskStation->updateHeartbeat();

        return response()->json([
            'message' => 'Heartbeat received',
        ]);
    }
}