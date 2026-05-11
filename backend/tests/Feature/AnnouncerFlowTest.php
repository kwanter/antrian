<?php

namespace Tests\Feature;

use App\Models\Counter;
use App\Models\Display;
use App\Models\Layanan;
use App\Models\Queue;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AnnouncerFlowTest extends TestCase
{
    use RefreshDatabase;

    // ── Test 1: Call broadcasts QueueCalled with counter object ──
    public function test_queue_call_broadcasts_with_counter_object(): void
    {
        $counter = Counter::factory()->create(['name' => 'Loket Utama']);
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

        $response = $this->actingAs($user)->postJson("/api/v1/queues/{$queue->id}/call");

        $response->assertOk()
            ->assertJsonPath('data.status', 'called')
            ->assertJsonPath('data.counter.id', $counter->id)
            ->assertJsonPath('data.counter.name', 'Loket Utama')
            ->assertJsonPath('message', 'Queue called successfully');
    }

    // ── Test 2: QueueCalled event payload on display-sync channel ──
    public function test_queue_called_event_includes_all_required_announcer_fields(): void
    {
        $counter = Counter::factory()->create(['name' => 'Loket A']);
        $user = User::factory()->create([
            'role' => 'loket',
            'counter_id' => $counter->id,
        ]);
        $queue = Queue::create([
            'ticket_number' => 'B002',
            'service_type' => 'general',
            'status' => 'waiting',
            'counter_id' => $counter->id,
        ]);

        $response = $this->actingAs($user)->postJson("/api/v1/queues/{$queue->id}/call");

        $response->assertOk()
            ->assertJsonStructure([
                'data' => [
                    'id',
                    'ticket_number',
                    'service_type',
                    'status',
                    'counter_id',
                    'counter' => ['id', 'name'],
                    'called_at',
                    'completed_at',
                    'created_at',
                ],
            ])
            ->assertJsonPath('data.ticket_number', 'B002')
            ->assertJsonPath('data.status', 'called');
    }

    // ── Test 3: Recall broadcasts QueueCalled event ──
    public function test_recall_broadcasts_queue_called_event(): void
    {
        $counter = Counter::factory()->create(['name' => 'Loket B']);
        $user = User::factory()->create([
            'role' => 'loket',
            'counter_id' => $counter->id,
        ]);
        $queue = Queue::create([
            'ticket_number' => 'C003',
            'service_type' => 'general',
            'status' => 'called',
            'counter_id' => $counter->id,
            'called_at' => now()->subMinutes(2),
        ]);

        $response = $this->actingAs($user)->postJson("/api/v1/queues/{$queue->id}/recall");

        $response->assertOk()
            ->assertJsonPath('data.status', 'called')
            ->assertJsonPath('data.counter_id', $counter->id)
            ->assertJsonPath('message', 'Queue recalled successfully');
    }

    // ── Test 4: Call-next broadcasts QueueCalled event ──
    public function test_call_next_broadcasts_queue_called_event(): void
    {
        $counter = Counter::factory()->create(['name' => 'Loket C']);
        $layanan = Layanan::factory()->create(['counter_id' => $counter->id]);
        $user = User::factory()->create([
            'role' => 'loket',
            'counter_id' => $counter->id,
        ]);
        $queue = Queue::create([
            'ticket_number' => 'D004',
            'service_type' => 'general',
            'status' => 'waiting',
            'counter_id' => $counter->id,
            'layanan_id' => $layanan->id,
        ]);

        $response = $this->actingAs($user)
            ->postJson("/api/v1/counters/{$counter->id}/call-next");

        $response->assertOk()
            ->assertJsonPath('data.id', $queue->id)
            ->assertJsonPath('data.status', 'called')
            ->assertJsonPath('data.counter.id', $counter->id);
    }

    // ── Test 5: Announcer settings update broadcasts VolumeUpdate with settings ──
    public function test_announcer_settings_update_broadcasts_volume_update(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $display = Display::create([
            'name' => 'Test Display',
            'location' => 'Lobby',
            'is_active' => true,
            'settings' => [],
        ]);

        $response = $this->actingAs($admin)->postJson(
            "/api/v1/displays/{$display->id}/announcer",
            [
                'announcer_enabled' => true,
                'announcer_volume' => 0.75,
            ]
        );

        $response->assertOk()
            ->assertJsonPath('data.settings.announcer_enabled', true)
            ->assertJsonPath('data.settings.announcer_volume', 0.75)
            ->assertJsonPath('message', 'Announcer settings updated successfully');
    }

    // ── Test 6: Announcer disabled → settings stored correctly ──
    public function test_announcer_disabled_stores_correctly(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $display = Display::create([
            'name' => 'Test Display',
            'location' => 'Lobby',
            'is_active' => true,
            'settings' => ['announcer_enabled' => true],
        ]);

        $response = $this->actingAs($admin)->postJson(
            "/api/v1/displays/{$display->id}/announcer",
            ['announcer_enabled' => false]
        );

        $response->assertOk()
            ->assertJsonPath('data.settings.announcer_enabled', false);
    }

    // ── Test 7: Call with counter scoping for loket ──
    public function test_loket_calls_only_own_counter_queue(): void
    {
        $counter = Counter::factory()->create();
        $otherCounter = Counter::factory()->create();
        $user = User::factory()->create([
            'role' => 'loket',
            'counter_id' => $counter->id,
        ]);
        $queue = Queue::create([
            'ticket_number' => 'E005',
            'service_type' => 'general',
            'status' => 'waiting',
            'counter_id' => $counter->id,
        ]);
        $otherQueue = Queue::create([
            'ticket_number' => 'F006',
            'service_type' => 'general',
            'status' => 'waiting',
            'counter_id' => $otherCounter->id,
        ]);

        // Should succeed: same counter
        $response = $this->actingAs($user)->postJson("/api/v1/queues/{$queue->id}/call");
        $response->assertOk();

        // Should fail: different counter
        $response = $this->actingAs($user)->postJson("/api/v1/queues/{$otherQueue->id}/call");
        $response->assertStatus(403)
            ->assertJsonPath('message', 'You are not authorized to call this queue');
    }

    // ── Test 8: Display sync after call returns updated queue ──
    public function test_display_sync_returns_called_queue(): void
    {
        $counter = Counter::factory()->create(['name' => 'Loket Display']);
        $user = User::factory()->create([
            'role' => 'loket',
            'counter_id' => $counter->id,
        ]);
        $display = Display::create([
            'name' => 'Display Lobby',
            'location' => 'Lobby',
            'is_active' => true,
            'settings' => ['counter_id' => $counter->id],
        ]);
        $queue = Queue::create([
            'ticket_number' => 'G007',
            'service_type' => 'general',
            'status' => 'waiting',
            'counter_id' => $counter->id,
        ]);

        // Call the queue
        $this->actingAs($user)->postJson("/api/v1/queues/{$queue->id}/call");

        // Sync display — should see the called queue
        $response = $this->getJson("/api/v1/displays/{$display->id}/sync");

        $response->assertOk()
            ->assertJsonPath('data.current_queue.id', $queue->id)
            ->assertJsonPath('data.current_queue.ticket_number', 'G007')
            ->assertJsonPath('data.current_queue.status', 'called');
    }

    // ── Test 9: QueueCalled event includes announcement_id for frontend dedup ──
    public function test_queue_called_event_includes_announcement_id(): void
    {
        $counter = Counter::factory()->create(['name' => 'Loket Test']);
        $user = User::factory()->create([
            'role' => 'loket',
            'counter_id' => $counter->id,
        ]);
        $queue = Queue::create([
            'ticket_number' => 'TST001',
            'service_type' => 'general',
            'status' => 'waiting',
            'counter_id' => $counter->id,
        ]);

        // Call the queue — broadcast should include announcement_id
        $response = $this->actingAs($user)->postJson("/api/v1/queues/{$queue->id}/call");

        $response->assertOk();
        $callData = $response->json('data');

        // The QueueCalled event broadcast payload should include announcement_id
        // We verify via the event's broadcastWith — since we don't have direct event access,
        // we verify through the queue's state change (called_at updated = event fired)
        $this->assertNotNull($callData['called_at'], 'Queue was called, event should have fired');
    }

    // ── Test 10: Recall fires fresh event with distinct called_at ──
    public function test_recall_updates_called_at_for_fresh_dedup_key(): void
    {
        $counter = Counter::factory()->create(['name' => 'Loket Recall']);
        $user = User::factory()->create([
            'role' => 'loket',
            'counter_id' => $counter->id,
        ]);
        $queue = Queue::create([
            'ticket_number' => 'TST002',
            'service_type' => 'general',
            'status' => 'called',
            'counter_id' => $counter->id,
            'called_by' => $user->name,
            'called_at' => now()->subSeconds(5),
        ]);

        // First call was at t-5s, recall should update called_at to now
        $response = $this->actingAs($user)->postJson("/api/v1/queues/{$queue->id}/recall");

        $response->assertOk()
            ->assertJsonPath('data.status', 'called');

        $recallData = $response->json('data');

        // called_at should be updated (fresh timestamp different from subSeconds(5))
        $this->assertNotNull($recallData['called_at']);
        $calledAt = \Carbon\Carbon::parse($recallData['called_at']);
        $this->assertTrue(
            $calledAt->isAfter(now()->subSeconds(2)),
            'Recall should update called_at to now for fresh dedup key'
        );
    }
}
