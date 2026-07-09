<?php

namespace App\Events;

use App\Models\Queue;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
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
        // F-22: queue-updates is operator-facing (loket). Make it private so
        // only authenticated users can subscribe — a snooping LAN client can
        // no longer read all queue lifecycle events.
        return [
            new PrivateChannel('queue-updates'),
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
                'layanan_id' => $this->queue->layanan_id,
                'counter_id' => $this->queue->counter_id,
                'counter' => $this->queue->counter ? [
                    'id' => $this->queue->counter->id,
                    'name' => $this->queue->counter->name,
                ] : null,
                'called_at' => $this->queue->called_at?->toISOString(),
                'completed_at' => $this->queue->completed_at?->toISOString(),
                'created_at' => $this->queue->created_at->toISOString(),
            ],
        ];
    }
}