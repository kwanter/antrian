<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Public-facing video shape. Projects only display_id and display.name —
 * never the full display relation or its settings. Closes F-20.
 */
class PublicVideoResource extends JsonResource
{
    public function toArray($request): array
    {
        /** @var \App\Models\Video $video */
        $video = $this->resource;

        return [
            'id' => $video->id,
            'display_id' => $video->display_id,
            'display_name' => $video->display?->name,
            'file_url' => $video->file_url,
            'title' => $video->title,
            'duration' => $video->duration,
            'volume_level' => $video->volume_level,
            'is_active' => $video->is_active,
            'playlist_order' => $video->playlist_order,
        ];
    }
}
