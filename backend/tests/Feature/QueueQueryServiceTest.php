<?php

namespace Tests\Feature;

use App\Models\Counter;
use App\Models\Queue;
use App\Models\User;
use App\Services\QueueQueryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QueueQueryServiceTest extends TestCase
{
    use RefreshDatabase;

    private QueueQueryService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = app(QueueQueryService::class);
    }

    private function loketWithCounter(): User
    {
        $counter = Counter::factory()->create();
        $user = User::factory()->create([
            'role' => 'loket',
            'is_active' => true,
            'counter_id' => $counter->id,
        ]);
        $counter->users()->attach($user->id, ['assigned_at' => now()]);

        return $user;
    }

    private function queueFor(?Counter $counter, string $ticketNumber, string $status = 'waiting'): Queue
    {
        return Queue::create([
            'ticket_number' => $ticketNumber,
            'service_type' => 'CS',
            'counter_id' => $counter?->id,
            'customer_name' => 'Test',
            'status' => $status,
            'created_at' => now(),
        ]);
    }

    public function test_list_scopes_loket_to_own_counter_and_unassigned_queues(): void
    {
        $loket = $this->loketWithCounter();
        $own = $this->queueFor($loket->counter, 'OWN001');
        $unassigned = $this->queueFor(null, 'UNASSIGNED001');
        $foreign = $this->queueFor(Counter::factory()->create(), 'FOREIGN001');

        $result = $this->service->list($loket, ['per_page' => 10]);
        $ids = collect($result->items())->pluck('id');

        $this->assertTrue($ids->contains($own->id));
        $this->assertTrue($ids->contains($unassigned->id));
        $this->assertFalse($ids->contains($foreign->id));
    }

    public function test_list_defaults_to_today(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        $today = $this->queueFor(null, 'TODAY001');
        $old = $this->queueFor(null, 'OLD001');
        $old->forceFill(['created_at' => now()->subDay()])->saveQuietly();

        $result = $this->service->list($admin, ['per_page' => 10]);
        $ids = collect($result->items())->pluck('id');

        $this->assertTrue($ids->contains($today->id));
        $this->assertFalse($ids->contains($old->id));
    }

    public function test_stats_counts_active_and_completed_today(): void
    {
        $calledAt = now()->subMinutes(5);
        $completedAt = now();

        $this->queueFor(null, 'WAIT001', 'waiting');
        $this->queueFor(null, 'CALL001', 'called');
        $this->queueFor(null, 'SERV001', 'serving');
        Queue::create([
            'ticket_number' => 'DONE001',
            'service_type' => 'CS',
            'status' => 'completed',
            'called_at' => $calledAt,
            'completed_at' => $completedAt,
            'created_at' => $calledAt->copy()->subMinutes(10),
        ]);

        $stats = $this->service->stats();

        $this->assertSame(3, $stats['active_queues']);
        $this->assertSame(1, $stats['waiting']);
        $this->assertSame(1, $stats['called']);
        $this->assertSame(1, $stats['serving']);
        $this->assertSame(1, $stats['completed_today']);
        $this->assertSame(5.0, $stats['avg_wait_minutes']);
    }
}
