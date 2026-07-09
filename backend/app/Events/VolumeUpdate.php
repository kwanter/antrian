<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class VolumeUpdate implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public int $displayId,
        public float $volume,
        public ?int $videoId = null,
        public ?array $settings = null
    ) {
    }

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('display.' . $this->displayId),
            new Channel('display-volume-updates'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'volume.update';
    }

    public function broadcastWith(): array
    {
        // F-21: project only the display-safe settings keys, not the full
        // admin-controlled blob. Announcer keys are operational and required
        // by the display runtime for live announcer updates. Arbitrary keys
        // (that future admin edits could introduce) are dropped.
        $safeSettings = null;
        if ($this->settings !== null) {
            $allowed = ['volume', 'counter_id', 'announcer_enabled', 'announcer_volume', 'announcer_sound_url', 'announcer_sound_title'];
            $safeSettings = array_intersect_key($this->settings, array_flip($allowed));
        }

        return [
            'display_id' => $this->displayId,
            'volume' => $this->volume,
            'video_id' => $this->videoId,
            'settings' => $safeSettings,
        ];
    }
}