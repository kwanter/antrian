<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\DisplayCompositeService;
use Illuminate\Http\JsonResponse;

class DisplayCompositeController extends Controller
{
    public function __invoke(DisplayCompositeService $composite): JsonResponse
    {
        // Public monitor polling must never enqueue or start an encoder.
        return response()->json(['data' => $composite->status()])
            ->header('Cache-Control', 'no-store');
    }
}
