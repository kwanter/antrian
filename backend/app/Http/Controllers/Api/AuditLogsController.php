<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditLogsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = AuditLog::with('user');

        // Filter by model
        if ($request->has('model')) {
            $query->where('model', $request->model);
        }

        // Filter by action
        if ($request->has('action')) {
            $query->where('action', $request->action);
        }

        // Filter by user
        if ($request->has('user_id')) {
            $query->where('user_id', $request->user_id);
        }

        // Filter by date range
        if ($request->has('start_date')) {
            $query->whereDate('created_at', '>=', $request->start_date);
        }

        if ($request->has('end_date')) {
            $query->whereDate('created_at', '<=', $request->end_date);
        }

        $logs = $query->latest()->paginate($request->get('per_page', 50));

        return response()->json([
            'data' => $logs->items(),
            'meta' => [
                'current_page' => $logs->currentPage(),
                'last_page' => $logs->lastPage(),
                'per_page' => $logs->perPage(),
                'total' => $logs->total(),
            ],
        ]);
    }

    public function show(AuditLog $auditLog): JsonResponse
    {
        return response()->json([
            'data' => $auditLog->load('user'),
        ]);
    }

    public function export(Request $request): JsonResponse
    {
        $query = AuditLog::with('user');

        // Apply same filters as index
        if ($request->has('model')) {
            $query->where('model', $request->model);
        }

        if ($request->has('action')) {
            $query->where('action', $request->action);
        }

        if ($request->has('user_id')) {
            $query->where('user_id', $request->user_id);
        }

        if ($request->has('start_date')) {
            $query->whereDate('created_at', '>=', $request->start_date);
        }

        if ($request->has('end_date')) {
            $query->whereDate('created_at', '<=', $request->end_date);
        }

        $logs = $query->latest()->limit(1000)->get();

        // Format for CSV export
        $csvData = $logs->map(function ($log) {
            return [
                'id' => $log->id,
                'user' => $log->user?->name ?? 'System',
                'action' => $log->action,
                'model' => $log->model,
                'model_id' => $log->model_id,
                'changes' => json_encode($log->changes),
                'ip_address' => $log->ip_address,
                'created_at' => $log->created_at->toISOString(),
            ];
        });

        return response()->json([
            'data' => $csvData,
            'count' => $csvData->count(),
        ]);
    }
}