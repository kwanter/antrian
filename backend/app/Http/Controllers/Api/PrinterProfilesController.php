<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PublicPrinterProfileResource;
use App\Models\AuditLog;
use App\Models\PrinterProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;

class PrinterProfilesController extends Controller
{
    public function index(): JsonResponse
    {
        $profiles = PrinterProfile::all();

        return response()->json([
            'data' => $profiles,
        ]);
    }

    public function defaultProfile(): JsonResponse
    {
        $profile = PrinterProfile::query()
            ->where('paper_size', '58mm')
            ->orderBy('id')
            ->first()
            ?? PrinterProfile::query()->orderBy('id')->first();

        // F-23: public default profile uses PublicPrinterProfileResource,
        // which trims peripheral config (connection_type, baud_rate) and
        // restricts logo_url to local /storage/ paths.
        return response()->json([
            'data' => $profile ? new PublicPrinterProfileResource($profile) : null,
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
            'template.paper_size' => 'sometimes|in:58mm,80mm',
            'template.copy_count' => 'sometimes|integer|min:1|max:10',
            'template.printer_model' => 'nullable|string|max:100',
            'template.connection_type' => 'sometimes|in:web_serial,windows_bridge',
            'template.baud_rate' => 'sometimes|integer|min:300|max:115200',
            'template.charset' => 'sometimes|in:utf-8,cp437,cp850',
            'template.cut_mode' => 'sometimes|in:none,partial,full',
            'template.header_text' => 'nullable|string|max:500',
            'template.footer_text' => 'nullable|string|max:500',
        ]);

        // F-36: strip unknown top-level template keys. Validation whitelists
        // known sub-keys but does not reject extras; drop them before persist.
        $template = $this->filterTemplate($request->template ?? []);
        $paperSize = $request->paper_size
            ?? $template['paper_size'] ?? '58mm';
        $copyCount = $request->copy_count
            ?? $template['copy_count'] ?? 1;
        $headerText = $request->header_text
            ?? $template['header_text'] ?? null;
        $footerText = $request->footer_text
            ?? $template['footer_text'] ?? null;

        $profile = PrinterProfile::create([
            'name' => $request->name,
            'paper_size' => $paperSize,
            'copy_count' => $copyCount,
            'header_text' => $headerText,
            'footer_text' => $footerText,
            'logo_url' => $request->logo_url,
            'template' => $template,
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
            'template.paper_size' => 'sometimes|in:58mm,80mm',
            'template.copy_count' => 'sometimes|integer|min:1|max:10',
            'template.printer_model' => 'nullable|string|max:100',
            'template.connection_type' => 'sometimes|in:web_serial,windows_bridge',
            'template.baud_rate' => 'sometimes|integer|min:300|max:115200',
            'template.charset' => 'sometimes|in:utf-8,cp437,cp850',
            'template.cut_mode' => 'sometimes|in:none,partial,full',
            'template.header_text' => 'nullable|string|max:500',
            'template.footer_text' => 'nullable|string|max:500',
        ]);

        // F-36: strip unknown top-level template keys before persist.
        $template = $this->filterTemplate($request->template ?? []);
        $paperSize = $request->paper_size
            ?? $template['paper_size'] ?? $printerProfile->paper_size;
        $copyCount = $request->copy_count
            ?? $template['copy_count'] ?? $printerProfile->copy_count;
        $headerText = $request->has('header_text')
            ? $request->header_text
            : ($template['header_text'] ?? $printerProfile->header_text);
        $footerText = $request->has('footer_text')
            ? $request->footer_text
            : ($template['footer_text'] ?? $printerProfile->footer_text);

        $printerProfile->update([
            'name' => $request->name ?? $printerProfile->name,
            'paper_size' => $paperSize,
            'copy_count' => $copyCount,
            'header_text' => $headerText,
            'footer_text' => $footerText,
            'logo_url' => $request->logo_url ?? $printerProfile->logo_url,
            'template' => $template ?: $printerProfile->template,
        ]);

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

    /**
     * Strip unknown top-level template keys before persistence (F-36).
     * Validation whitelists known sub-keys but does not reject extras, so an
     * admin could otherwise persist arbitrary keys that later surface on the
     * public default-profile endpoint.
     */
    private function filterTemplate(array $template): array
    {
        $allowed = [
            'paper_size',
            'copy_count',
            'printer_model',
            'connection_type',
            'baud_rate',
            'charset',
            'cut_mode',
            'header_text',
            'footer_text',
        ];

        return Arr::only($template, $allowed);
    }
}
