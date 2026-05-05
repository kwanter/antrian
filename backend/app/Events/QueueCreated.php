<?php

namespace App\Events;

use App\Models\Queue;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class QueueCreated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public Queue $queue)
    {
    }

    public function broadcastOn(): array
    {
        return [
            new Channel('queue-updates'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'queue.created';
    }

    public function broadcastWith(): array
    {
        return [
            'queue' => [
                'id' => $this->queue->id,
                'ticket_number' => $this->queue->ticket_number,
                'service_type' => $this->queue->service_type,
                'status' => $this->queue->status,
                'counter' => $this->queue->counter ? [
                    'id' => $this->queue->counter->id,
                    'name' => $this->queue->counter->name,
                ] : null,
                'created_at' => $this->queue->created_at->toISOString(),
            ],
        ];
    }
}