<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class VolumeUpdate implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public int $displayId,
        public float $volume,
        public ?int $videoId = null
    ) {
    }

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('display.' . $this->displayId),
            new PrivateChannel('display-volume-updates'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'volume.update';
    }

    public function broadcastWith(): array
    {
        return [
            'display_id' => $this->displayId,
            'volume' => $this->volume,
            'video_id' => $this->videoId,
        ];
    }
}