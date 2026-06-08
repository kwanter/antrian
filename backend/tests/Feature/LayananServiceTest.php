<?php

namespace Tests\Feature;

use App\Models\Counter;
use App\Models\Layanan;
use App\Models\Queue;
use App\Models\User;
use App\Services\LayananService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class LayananServiceTest extends TestCase
{
    use RefreshDatabase;

    private LayananService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = app(LayananService::class);
    }

    // ── create() ──────────────────────────────────────────────

    public function test_create_layanan_with_counter(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        $counter = Counter::factory()->create();

        $layanan = $this->service->create([
            'name' => 'Layanan Hukum',
            'code' => 'HUK',
            'counter_id' => $counter->id,
        ], $admin);

        $this->assertSame('Layanan Hukum', $layanan->name);
        $this->assertSame($counter->id, $layanan->counter_id);
        $this->assertTrue($layanan->relationLoaded('counter'));
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'create',
            'model' => 'Layanan',
            'model_id' => $layanan->id,
            'user_id' => $admin->id,
        ]);
    }

    public function test_create_rejects_duplicate_counter(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        $counter = Counter::factory()->create();
        Layanan::factory()->create(['counter_id' => $counter->id, 'code' => 'FIRST']);

        try {
            $this->service->create([
                'name' => 'Second Layanan',
                'code' => 'SEC',
                'counter_id' => $counter->id,
            ], $admin);
        } catch (ValidationException $e) {
            $this->assertSame('Counter sudah memiliki layanan lain', $e->errors()['counter_id'][0]);

            return;
        }
        $this->fail('Expected ValidationException for duplicate counter');
    }

    // ── update() ──────────────────────────────────────────────

    public function test_update_layanan_preserves_counter(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        $layanan = Layanan::factory()->create(['code' => 'HUK']);

        $result = $this->service->update($layanan, ['name' => 'Updated Name'], $admin);

        $this->assertSame('Updated Name', $result->name);
        $this->assertSame('HUK', $result->code);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'update',
            'model' => 'Layanan',
            'model_id' => $layanan->id,
        ]);
    }

    public function test_update_reassigns_counter(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        $old = Counter::factory()->create();
        $new = Counter::factory()->create();
        $layanan = Layanan::factory()->create(['counter_id' => $old->id, 'code' => 'HUK']);

        $result = $this->service->update($layanan, ['counter_id' => $new->id], $admin);

        $this->assertSame($new->id, $result->counter_id);
    }

    public function test_update_rejects_already_assigned_counter(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        $taken = Counter::factory()->create();
        Layanan::factory()->create(['counter_id' => $taken->id, 'code' => 'TAKEN']);
        $layanan = Layanan::factory()->create(['code' => 'HUK']);

        try {
            $this->service->update($layanan, ['counter_id' => $taken->id], $admin);
        } catch (ValidationException $e) {
            $this->assertSame('Counter sudah memiliki layanan lain', $e->errors()['counter_id'][0]);

            return;
        }
        $this->fail('Expected ValidationException for taken counter');
    }

    public function test_update_allows_keeping_own_counter(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        $counter = Counter::factory()->create();
        $layanan = Layanan::factory()->create(['counter_id' => $counter->id, 'code' => 'HUK']);

        $result = $this->service->update($layanan, [
            'name' => 'Updated',
            'counter_id' => $counter->id,
        ], $admin);

        $this->assertSame('Updated', $result->name);
        $this->assertSame($counter->id, $result->counter_id);
    }

    // ── deactivate() ──────────────────────────────────────────

    public function test_deactivate_soft_deactivates_layanan(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        $layanan = Layanan::factory()->create(['is_active' => true]);

        $result = $this->service->deactivate($layanan, $admin);

        $this->assertFalse($result->is_active);
        $this->assertDatabaseHas('layanans', ['id' => $layanan->id, 'is_active' => false]);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'deactivate',
            'model' => 'Layanan',
            'model_id' => $layanan->id,
        ]);
    }

    // ── queues() ──────────────────────────────────────────────

    public function test_queues_returns_today_queues_by_default(): void
    {
        $layanan = Layanan::factory()->create();
        $called = Queue::create([
            'ticket_number' => 'T001',
            'service_type' => 'Test',
            'layanan_id' => $layanan->id,
            'status' => 'called',
        ]);
        $waiting = Queue::create([
            'ticket_number' => 'T002',
            'service_type' => 'Test',
            'layanan_id' => $layanan->id,
            'status' => 'waiting',
        ]);

        $result = $this->service->queues($layanan);

        // Default: called + serving only. waiting should not appear.
        $ids = collect($result->items())->pluck('id');
        $this->assertTrue($ids->contains($called->id));
        $this->assertFalse($ids->contains($waiting->id));
    }
}
