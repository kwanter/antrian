<?php

namespace App\Events;

use App\Models\Queue;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Str;

class QueueCalled implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public string $announcementId;

    public function __construct(public Queue $queue)
    {
        $this->announcementId = Str::uuid()->toString();
    }

    public function broadcastOn(): array
    {
        // F-08: loket.{counterId} is a PrivateChannel so only operators
        // authorized for that counter (or admins) can subscribe — a snooping
        // LAN client can no longer read all counters' operator streams.
        // F-22: queue-updates is operator-facing (loket) -> private.
        // display-sync stays public because displays are unauthenticated LAN
        // clients by design and need "now serving" data.
        return [
            new PrivateChannel('queue-updates'),
            new PrivateChannel('loket.' . $this->queue->counter_id),
            new Channel('display-sync'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'queue.called';
    }

    public function broadcastWith(): array
    {
        return [
            'announcement_id' => $this->announcementId,
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
                'created_at' => $this->queue->created_at?->toISOString(),
            ],
            'previous_status' => $this->queue->getOriginal('status'),
        ];
    }
}