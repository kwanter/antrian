<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\LayananRequest;
use App\Models\Layanan;
use App\Services\LayananService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LayananController extends Controller
{
    public function __construct(
        private readonly LayananService $layananService,
    ) {}

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
        $layanan = $this->layananService->create(
            $request->validated(),
            $request->user(),
        );

        return response()->json([
            'data' => $layanan,
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
        $layanan = $this->layananService->update(
            $layanan,
            $request->validated(),
            $request->user(),
        );

        return response()->json([
            'data' => $layanan,
            'message' => 'Layanan updated successfully',
        ]);
    }

    public function destroy(Request $request, Layanan $layanan): JsonResponse
    {
        $layanan = $this->layananService->deactivate($layanan, $request->user());

        return response()->json([
            'data' => $layanan,
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

        $paginated = $this->layananService->queues($layanan, $request->only(['status', 'date', 'counter_id']));

        return response()->json(
            $this->layananService->serializeQueuePage($paginated)
        );
    }
}
