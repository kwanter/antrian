<?php

namespace App\Http\Resources;

use App\Models\Display;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Public-facing display shape. Projects only allowlisted settings keys and
 * drops arbitrary admin-stored JSON from the payload served to public
 * display clients. Closes F-19 / F-20.
 */
class PublicDisplayResource extends JsonResource
{
    /**
     * Settings keys safe to expose to unauthenticated display viewers.
     * These are the keys the display runtime (frontend/app/display) reads
     * to render playback and announcements. Keep in sync with
     * DisplaysController::SETTINGS_ALLOWLIST.
     */
    public const SETTINGS_ALLOWLIST = [
        'volume',
        'counter_id',
        'announcer_enabled',
        'announcer_volume',
        'announcer_sound_url',
        'announcer_sound_title',
    ];

    public function toArray($request): array
    {
        /** @var Display $display */
        $display = $this->resource;

        return [
            'id' => $display->id,
            'name' => $display->name,
            'location' => $display->location,
            'is_active' => $display->is_active,
            'settings' => $this->safeSettings($display),
            'videos' => PublicVideoResource::collection(
                $display->relationLoaded('videos') ? $display->videos : $display->activeVideos
            ),
        ];
    }

    private function safeSettings(Display $display): array
    {
        $all = $display->settings ?? [];

        return array_intersect_key($all, array_flip(self::SETTINGS_ALLOWLIST));
    }
}
