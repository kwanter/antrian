<?php

namespace Tests\Feature;

use App\Models\Counter;
use App\Models\Display;
use App\Models\Layanan;
use App\Models\Queue;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QueueDateSafetyTest extends TestCase
{
    use RefreshDatabase;

    public function test_display_sync_excludes_old_day_queues_and_waiting_recent(): void
    {
        $counter = Counter::factory()->create();
        $otherCounter = Counter::factory()->create();
        $display = Display::create([
            'name' => 'Main Display',
            'location' => 'Lobby',
            'settings' => ['counter_id' => $counter->id],
            'is_active' => true,
        ]);

        Queue::create([
            'ticket_number' => 'A001',
            'service_type' => 'general',
            'status' => 'called',
            'counter_id' => $counter->id,
            'called_at' => now()->subDay(),
        ])->forceFill(['created_at' => now()->subDay()])->save();

        Queue::create([
            'ticket_number' => 'A002',
            'service_type' => 'general',
            'status' => 'waiting',
            'counter_id' => $counter->id,
        ]);

        Queue::create([
            'ticket_number' => 'A999',
            'service_type' => 'general',
            'status' => 'called',
            'counter_id' => $otherCounter->id,
            'called_at' => now()->subSeconds(30),
        ]);

        $recentCalled = Queue::create([
            'ticket_number' => 'A003',
            'service_type' => 'general',
            'status' => 'called',
            'counter_id' => $counter->id,
            'called_at' => now()->subMinute(),
        ]);

        $todayCalled = Queue::create([
            'ticket_number' => 'A004',
            'service_type' => 'general',
            'status' => 'called',
            'counter_id' => $counter->id,
            'called_at' => now(),
        ]);

        $response = $this->getJson("/api/v1/displays/{$display->id}/sync");

        $response->assertOk()
            ->assertJsonPath('data.current_queue.id', $todayCalled->id)
            ->assertJsonCount(1, 'data.recent_queues')
            ->assertJsonPath('data.recent_queues.0.id', $recentCalled->id);
    }

    public function test_direct_call_rejects_old_day_waiting_queue(): void
    {
        $counter = Counter::factory()->create();
        $user = User::factory()->create([
            'role' => 'loket',
            'counter_id' => $counter->id,
        ]);
        $queue = Queue::create([
            'ticket_number' => 'A001',
            'service_type' => 'general',
            'status' => 'waiting',
            'counter_id' => $counter->id,
        ]);
        $queue->forceFill(['created_at' => now()->subDay()])->save();

        $response = $this->actingAs($user)->postJson("/api/v1/queues/{$queue->id}/call");

        $response->assertStatus(422)
            ->assertJsonPath('message', 'Queue is not from today');
    }

    public function test_recall_rejects_old_day_called_queue(): void
    {
        $counter = Counter::factory()->create();
        $user = User::factory()->create([
            'role' => 'loket',
            'counter_id' => $counter->id,
        ]);
        $queue = Queue::create([
            'ticket_number' => 'A001',
            'service_type' => 'general',
            'status' => 'called',
            'counter_id' => $counter->id,
            'called_at' => now()->subDay(),
        ]);
        $queue->forceFill(['created_at' => now()->subDay()])->save();

        $response = $this->actingAs($user)->postJson("/api/v1/queues/{$queue->id}/recall");

        $response->assertStatus(422)
            ->assertJsonPath('message', 'Queue is not from today');
    }

    public function test_recall_rejects_completed_queue(): void
    {
        $counter = Counter::factory()->create();
        $user = User::factory()->create([
            'role' => 'loket',
            'counter_id' => $counter->id,
        ]);
        $queue = Queue::create([
            'ticket_number' => 'A001',
            'service_type' => 'general',
            'status' => 'completed',
            'counter_id' => $counter->id,
            'created_at' => now(),
            'called_at' => now(),
            'completed_at' => now(),
        ]);

        $response = $this->actingAs($user)->postJson("/api/v1/queues/{$queue->id}/recall");

        $response->assertStatus(400)
            ->assertJsonPath('message', 'Queue is not in called, serving, or skipped status');
    }

    public function test_recall_accepts_skipped_queue_today(): void
    {
        $counter = Counter::factory()->create();
        $user = User::factory()->create([
            'role' => 'loket',
            'counter_id' => $counter->id,
        ]);
        $queue = Queue::create([
            'ticket_number' => 'A001',
            'service_type' => 'general',
            'status' => 'skipped',
            'counter_id' => $counter->id,
            'called_at' => now()->subMinutes(10),
            'completed_at' => now()->subMinutes(8),
        ]);

        $response = $this->actingAs($user)->postJson("/api/v1/queues/{$queue->id}/recall");

        $response->assertOk()
            ->assertJsonPath('data.id', $queue->id)
            ->assertJsonPath('data.status', 'called')
            ->assertJsonPath('data.counter_id', $counter->id);
    }

    public function test_recall_rejects_old_day_skipped_queue(): void
    {
        $counter = Counter::factory()->create();
        $user = User::factory()->create([
            'role' => 'loket',
            'counter_id' => $counter->id,
        ]);
        $queue = Queue::create([
            'ticket_number' => 'A001',
            'service_type' => 'general',
            'status' => 'skipped',
            'counter_id' => $counter->id,
            'called_at' => now()->subDay(),
        ]);
        $queue->forceFill(['created_at' => now()->subDay()])->save();

        $response = $this->actingAs($user)->postJson("/api/v1/queues/{$queue->id}/recall");

        $response->assertStatus(422)
            ->assertJsonPath('message', 'Queue is not from today');
    }

    public function test_call_next_ignores_old_day_waiting_queue(): void
    {
        $counter = Counter::factory()->create();
        $layanan = Layanan::factory()->create(['counter_id' => $counter->id]);
        $user = User::factory()->create([
            'role' => 'loket',
            'counter_id' => $counter->id,
        ]);

        Queue::create([
            'ticket_number' => 'A001',
            'service_type' => 'general',
            'status' => 'waiting',
            'counter_id' => $counter->id,
            'layanan_id' => $layanan->id,
        ])->forceFill(['created_at' => now()->subDay()])->save();
        $todayQueue = Queue::create([
            'ticket_number' => 'A002',
            'service_type' => 'general',
            'status' => 'waiting',
            'counter_id' => $counter->id,
            'layanan_id' => $layanan->id,
        ]);

        $response = $this->actingAs($user)->postJson("/api/v1/counters/{$counter->id}/call-next");

        $response->assertOk()
            ->assertJsonPath('data.id', $todayQueue->id)
            ->assertJsonPath('data.layanan_id', $layanan->id)
            ->assertJsonPath('data.counter_id', $counter->id)
            ->assertJsonStructure([
                'data' => ['id', 'ticket_number', 'service_type', 'status', 'layanan_id', 'counter_id', 'counter', 'layanan', 'created_at', 'called_at', 'completed_at'],
            ]);
    }

    public function test_complete_returns_full_queue_payload(): void
    {
        $counter = Counter::factory()->create();
        $layanan = Layanan::factory()->create(['counter_id' => $counter->id]);
        $user = User::factory()->create([
            'role' => 'loket',
            'counter_id' => $counter->id,
        ]);
        $queue = Queue::create([
            'ticket_number' => 'A001',
            'service_type' => 'general',
            'status' => 'called',
            'counter_id' => $counter->id,
            'layanan_id' => $layanan->id,
            'created_at' => now(),
            'called_at' => now()->subMinutes(5),
        ]);

        $response = $this->actingAs($user)->postJson("/api/v1/queues/{$queue->id}/complete");

        $response->assertOk()
            ->assertJsonPath('data.id', $queue->id)
            ->assertJsonPath('data.status', 'completed')
            ->assertJsonPath('data.layanan_id', $layanan->id)
            ->assertJsonPath('data.counter_id', $counter->id)
            ->assertJsonStructure([
                'data' => ['id', 'ticket_number', 'service_type', 'status', 'layanan_id', 'counter_id', 'counter', 'layanan', 'created_at', 'called_at', 'completed_at'],
            ]);
    }
}
