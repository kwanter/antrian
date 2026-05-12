<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Queue;
use App\Services\DynamicAnnouncerService;
use Illuminate\Http\JsonResponse;

class TtsController extends Controller
{
    public function queue(Queue $queue, DynamicAnnouncerService $tts): JsonResponse
    {
        $audioUrl = $tts->audioUrlForQueue($queue);

        return response()->json([
            'audio_url' => $audioUrl,
            'ticket_number' => $queue->ticket_number,
            'counter' => $queue->counter?->name,
        ]);
    }
}
