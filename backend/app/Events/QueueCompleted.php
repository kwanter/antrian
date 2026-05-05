<?php

namespace App\Events;

use App\Models\Queue;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class QueueCompleted implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public Queue $queue)
    {
    }

    public function broadcastOn(): array
    {
        return [
            new Channel('queue-updates'),
            new Channel('display-sync'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'queue.completed';
    }

    public function broadcastWith(): array
    {
        return [
            'queue' => [
                'id' => $this->queue->id,
                'ticket_number' => $this->queue->ticket_number,
                'status' => $this->queue->status,
                'counter' => $this->queue->counter ? [
                    'id' => $this->queue->counter->id,
                    'name' => $this->queue->counter->name,
                ] : null,
                'completed_at' => $this->queue->completed_at?->toISOString(),
            ],
            'previous_status' => $this->queue->getOriginal('status'),
        ];
    }
}