<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Public-facing queue shape. Excludes customer PII (customer_name,
 * customer_phone). Mirrors the explicit-field pattern already used by
 * LayananService::serializeQueuePage(). Closes F-09.
 */
class PublicQueueResource extends JsonResource
{
    public function toArray($request): array
    {
        /** @var \App\Models\Queue $queue */
        $queue = $this->resource;

        return [
            'id' => $queue->id,
            'ticket_number' => $queue->ticket_number,
            'service_type' => $queue->service_type,
            'status' => $queue->status,
            'layanan_id' => $queue->layanan_id,
            'counter_id' => $queue->counter_id,
            'counter' => $queue->counter ? [
                'id' => $queue->counter->id,
                'name' => $queue->counter->name,
                'code' => $queue->counter->code,
                'status' => $queue->counter->status,
            ] : null,
            'called_at' => $queue->called_at,
            'completed_at' => $queue->completed_at,
            'created_at' => $queue->created_at,
        ];
    }
}
