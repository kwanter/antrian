<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\PrinterProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PrinterProfilesController extends Controller
{
    public function index(): JsonResponse
    {
        $profiles = PrinterProfile::all();

        return response()->json([
            'data' => $profiles,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'name' => 'required|string|max:100',
            'paper_size' => 'sometimes|in:58mm,80mm',
            'copy_count' => 'sometimes|integer|min:1|max:10',
            'header_text' => 'nullable|string|max:500',
            'footer_text' => 'nullable|string|max:500',
            'logo_url' => 'nullable|url',
            'template' => 'nullable|array',
        ]);

        $profile = PrinterProfile::create([
            'name' => $request->name,
            'paper_size' => $request->paper_size ?? '58mm',
            'copy_count' => $request->copy_count ?? 1,
            'header_text' => $request->header_text,
            'footer_text' => $request->footer_text,
            'logo_url' => $request->logo_url,
            'template' => $request->template,
        ]);

        AuditLog::log(
            action: 'create',
            model: 'PrinterProfile',
            modelId: $profile->id,
            changes: $profile->toArray(),
            ipAddress: $request->ip(),
            userId: $request->user()?->id
        );

        return response()->json([
            'data' => $profile,
            'message' => 'Printer profile created successfully',
        ], 201);
    }

    public function show(PrinterProfile $printerProfile): JsonResponse
    {
        return response()->json([
            'data' => $printerProfile->load('kioskStations'),
        ]);
    }

    public function update(Request $request, PrinterProfile $printerProfile): JsonResponse
    {
        $oldData = $printerProfile->toArray();

        $request->validate([
            'name' => 'sometimes|string|max:100',
            'paper_size' => 'sometimes|in:58mm,80mm',
            'copy_count' => 'sometimes|integer|min:1|max:10',
            'header_text' => 'nullable|string|max:500',
            'footer_text' => 'nullable|string|max:500',
            'logo_url' => 'nullable|url',
            'template' => 'nullable|array',
        ]);

        $printerProfile->update($request->only([
            'name', 'paper_size', 'copy_count', 'header_text', 'footer_text', 'logo_url', 'template'
        ]));

        AuditLog::log(
            action: 'update',
            model: 'PrinterProfile',
            modelId: $printerProfile->id,
            changes: ['before' => $oldData, 'after' => $printerProfile->toArray()],
            ipAddress: $request->ip(),
            userId: $request->user()?->id
        );

        return response()->json([
            'data' => $printerProfile,
            'message' => 'Printer profile updated successfully',
        ]);
    }

    public function destroy(Request $request, PrinterProfile $printerProfile): JsonResponse
    {
        // Check if profile is in use
        if ($printerProfile->kioskStations()->exists()) {
            return response()->json([
                'message' => 'Cannot delete profile that is assigned to kiosk stations',
            ], 400);
        }

        $oldData = $printerProfile->toArray();
        $printerProfile->delete();

        AuditLog::log(
            action: 'delete',
            model: 'PrinterProfile',
            modelId: $printerProfile->id,
            changes: $oldData,
            ipAddress: $request->ip(),
            userId: $request->user()?->id
        );

        return response()->json([
            'message' => 'Printer profile deleted successfully',
        ]);
    }
}