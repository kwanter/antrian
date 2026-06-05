<?php

namespace Tests\Feature;

use App\Models\Counter;
use App\Models\KioskStation;
use App\Models\Layanan;
use App\Models\Queue;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Verifies the RBAC boundary between admin/super and loket roles.
 * This test locks down the regression where a loket user could reach
 * admin-only management endpoints and elevates to a critical guard.
 */
class RoleAccessTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Fake cache store so RateLimiter tests use array cache
        config(['cache.default' => 'array']);
    }

    private function createUser(string $role): User
    {
        return User::factory()->create([
            'role' => $role,
            'is_active' => true,
        ]);
    }

    private function createLoketWithCounter(): User
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

    private function createQueueForCounter(Counter $counter, string $status = 'waiting'): Queue
    {
        return Queue::create([
            'ticket_number' => 'T001',
            'service_type' => 'CS',
            'counter_id' => $counter->id,
            'customer_name' => 'Test',
            'status' => $status,
            'created_at' => now(), // today
        ]);
    }

    // ────────────────────────────────────────────
    // Login
    // ────────────────────────────────────────────

    public function test_login_returns_401_for_wrong_credentials(): void
    {
        User::factory()->create([
            'email' => 'admin@test.com',
            'password' => bcrypt('secret123'),
            'role' => 'admin',
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@test.com',
            'password' => 'wrong',
        ]);

        $response->assertStatus(401);
        $response->assertJson([
            'code' => 'INVALID_CREDENTIALS',
        ]);
        $response->assertJsonFragment([
            'message' => 'Email atau password salah.',
        ]);
    }

    public function test_login_returns_403_for_inactive_user(): void
    {
        User::factory()->create([
            'email' => 'inactive@test.com',
            'password' => bcrypt('secret123'),
            'is_active' => false,
            'role' => 'admin',
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'inactive@test.com',
            'password' => 'secret123',
        ]);

        $response->assertStatus(403);
        $response->assertJson(['code' => 'ACCOUNT_INACTIVE']);
    }

    public function test_login_returns_429_after_5_failed_attempts(): void
    {
        User::factory()->create([
            'email' => 'lock@test.com',
            'password' => bcrypt('correct'),
            'role' => 'loket',
            'is_active' => true,
        ]);

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/auth/login', [
                'email' => 'lock@test.com',
                'password' => 'wrong',
            ]);
        }

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'lock@test.com',
            'password' => 'wrong',
        ]);

        $response->assertStatus(429);
        $response->assertJson(['code' => 'TOO_MANY_ATTEMPTS']);
    }

    // ────────────────────────────────────────────
    // Gate: unauthenticated
    // ────────────────────────────────────────────

    public function test_unauthenticated_user_gets_401_on_protected_route(): void
    {
        $response = $this->getJson('/api/v1/users');
        $response->assertStatus(401);
    }

    // ────────────────────────────────────────────
    // Users CRUD — admin-only
    // ────────────────────────────────────────────

    public function test_loket_cannot_list_users(): void
    {
        $loket = $this->createLoketWithCounter();

        $response = $this->actingAs($loket)->getJson('/api/v1/users');
        $response->assertStatus(403);
    }

    public function test_loket_cannot_create_user(): void
    {
        $loket = $this->createLoketWithCounter();

        $response = $this->actingAs($loket)->postJson('/api/v1/users', [
            'name' => 'New User',
            'email' => 'new@test.com',
            'password' => 'password',
            'role' => 'loket',
        ]);
        $response->assertStatus(403);
    }

    public function test_loket_cannot_update_user(): void
    {
        $loket = $this->createLoketWithCounter();
        $target = $this->createUser('loket');

        $response = $this->actingAs($loket)->putJson("/api/v1/users/{$target->id}", [
            'name' => 'Changed',
        ]);
        $response->assertStatus(403);
    }

    public function test_loket_cannot_delete_user(): void
    {
        $loket = $this->createLoketWithCounter();
        $target = $this->createUser('loket');

        $response = $this->actingAs($loket)->deleteJson("/api/v1/users/{$target->id}");
        $response->assertStatus(403);
    }

    public function test_admin_can_manage_users(): void
    {
        $admin = $this->createUser('admin');
        $target = $this->createUser('loket');

        $this->actingAs($admin)->getJson('/api/v1/users')->assertOk();
        $this->actingAs($admin)->postJson('/api/v1/users', [
            'name' => 'New User',
            'email' => 'new@test.com',
            'password' => 'password',
            'role' => 'loket',
        ])->assertStatus(201);
        $this->actingAs($admin)->putJson("/api/v1/users/{$target->id}", [
            'name' => 'Changed',
        ])->assertOk();
        $this->actingAs($admin)->deleteJson("/api/v1/users/{$target->id}")->assertOk();
    }

    public function test_admin_can_change_user_role(): void
    {
        $admin = $this->createUser('admin');
        $target = $this->createUser('loket');

        $response = $this->actingAs($admin)->putJson("/api/v1/users/{$target->id}", [
            'role' => 'admin',
        ]);
        $response->assertOk();
        $this->assertDatabaseHas('users', [
            'id' => $target->id,
            'role' => 'admin',
        ]);
    }

    // ────────────────────────────────────────────
    // Counters — admin-only
    // ────────────────────────────────────────────

    public function test_loket_cannot_list_counters(): void
    {
        $loket = $this->createLoketWithCounter();

        $response = $this->actingAs($loket)->getJson('/api/v1/counters');
        $response->assertStatus(403);
    }

    public function test_loket_cannot_create_counter(): void
    {
        $loket = $this->createLoketWithCounter();

        $response = $this->actingAs($loket)->postJson('/api/v1/counters', [
            'name' => 'Counter X',
            'code' => 'CXX',
        ]);
        $response->assertStatus(403);
    }

    public function test_admin_can_manage_counters(): void
    {
        $admin = $this->createUser('admin');

        $this->actingAs($admin)->postJson('/api/v1/counters', [
            'name' => 'Counter X',
            'code' => 'CXX',
        ])->assertStatus(201);
        $this->actingAs($admin)->getJson('/api/v1/counters')->assertOk();
    }

    // ────────────────────────────────────────────
    // Kiosk Stations — admin-only
    // ────────────────────────────────────────────

    public function test_loket_cannot_manage_kiosk_stations(): void
    {
        $loket = $this->createLoketWithCounter();
        $station = KioskStation::create([
            'name' => 'Station 1',
            'bridge_token' => 'test',
            'status' => 'offline',
        ]);

        $this->actingAs($loket)->getJson('/api/v1/kiosk-stations')->assertStatus(403);
        $this->actingAs($loket)->postJson('/api/v1/kiosk-stations', [
            'name' => 'Station X',
        ])->assertStatus(403);
        $this->actingAs($loket)->putJson("/api/v1/kiosk-stations/{$station->id}", [
            'name' => 'Changed',
        ])->assertStatus(403);
        $this->actingAs($loket)->deleteJson("/api/v1/kiosk-stations/{$station->id}")->assertStatus(403);
    }

    public function test_admin_can_manage_kiosk_stations(): void
    {
        $admin = $this->createUser('admin');
        $station = KioskStation::create([
            'name' => 'Station 1',
            'bridge_token' => 'test',
            'status' => 'offline',
        ]);

        $this->actingAs($admin)->getJson('/api/v1/kiosk-stations')->assertOk();
        $this->actingAs($admin)->postJson('/api/v1/kiosk-stations', [
            'name' => 'Station X',
        ])->assertStatus(201);
        $this->actingAs($admin)->putJson("/api/v1/kiosk-stations/{$station->id}", [
            'name' => 'Changed',
        ])->assertOk();
    }

    // ────────────────────────────────────────────
    // Layanan write — admin-only
    // ────────────────────────────────────────────

    public function test_loket_cannot_create_or_update_layanan(): void
    {
        $loket = $this->createLoketWithCounter();
        $layanan = Layanan::create([
            'name' => 'Umum',
            'code' => 'UMM',
            'is_active' => true,
        ]);

        $this->actingAs($loket)->postJson('/api/v1/layanans', [
            'name' => 'Baru',
            'code' => 'BRU',
        ])->assertStatus(403);

        $this->actingAs($loket)->putJson("/api/v1/layanans/{$layanan->id}", [
            'name' => 'Changed',
        ])->assertStatus(403);

        $this->actingAs($loket)->deleteJson("/api/v1/layanans/{$layanan->id}")->assertStatus(403);
    }

    public function test_admin_can_create_and_update_layanan(): void
    {
        $admin = $this->createUser('admin');
        $layanan = Layanan::create([
            'name' => 'Umum',
            'code' => 'UMM',
            'is_active' => true,
        ]);

        $this->actingAs($admin)->postJson('/api/v1/layanans', [
            'name' => 'Baru',
            'code' => 'BRU',
        ])->assertStatus(201);

        $this->actingAs($admin)->putJson("/api/v1/layanans/{$layanan->id}", [
            'name' => 'Updated',
            'code' => 'UMM2',
        ])->assertOk();
    }

    // ────────────────────────────────────────────
    // Audit Logs — admin-only
    // ────────────────────────────────────────────

    public function test_loket_cannot_view_audit_logs(): void
    {
        $loket = $this->createLoketWithCounter();

        $this->actingAs($loket)->getJson('/api/v1/audit-logs')->assertStatus(403);
        $this->actingAs($loket)->getJson('/api/v1/audit-logs/export')->assertStatus(403);
    }

    public function test_admin_can_view_audit_logs(): void
    {
        $admin = $this->createUser('admin');

        $this->actingAs($admin)->getJson('/api/v1/audit-logs')->assertOk();
    }

    // ────────────────────────────────────────────
    // Queue ops — loket allowed (scoped)
    // ────────────────────────────────────────────

    public function test_loket_can_call_queue_for_own_counter(): void
    {
        $loket = $this->createLoketWithCounter();
        $queue = $this->createQueueForCounter($loket->counter);

        $response = $this->actingAs($loket)->postJson("/api/v1/queues/{$queue->id}/call");
        $response->assertOk();
    }

    public function test_loket_cannot_call_queue_for_foreign_counter(): void
    {
        $loket = $this->createLoketWithCounter();
        $otherCounter = Counter::factory()->create();
        $foreignQueue = $this->createQueueForCounter($otherCounter);

        $response = $this->actingAs($loket)->postJson("/api/v1/queues/{$foreignQueue->id}/call");
        $response->assertStatus(403);
    }

    public function test_loket_cannot_view_queue_for_foreign_counter(): void
    {
        $loket = $this->createLoketWithCounter();
        $otherCounter = Counter::factory()->create();
        $foreignQueue = $this->createQueueForCounter($otherCounter);

        $response = $this->actingAs($loket)->getJson("/api/v1/queues/{$foreignQueue->id}");
        $response->assertStatus(403);
    }

    public function test_admin_can_view_any_queue(): void
    {
        $admin = $this->createUser('admin');
        $counter = Counter::factory()->create();
        $queue = $this->createQueueForCounter($counter);

        $response = $this->actingAs($admin)->getJson("/api/v1/queues/{$queue->id}");
        $response->assertOk();
    }

    public function test_admin_can_complete_any_queue(): void
    {
        $admin = $this->createUser('admin');
        $counter = Counter::factory()->create();
        $queue = $this->createQueueForCounter($counter, 'called');

        $response = $this->actingAs($admin)->postJson("/api/v1/queues/{$queue->id}/complete");
        $response->assertOk();
    }

    // ────────────────────────────────────────────
    // Public routes stay public
    // ────────────────────────────────────────────

    public function test_kiosk_queue_creation_stays_public(): void
    {
        $layanan = Layanan::create([
            'name' => 'Umum',
            'code' => 'UMM',
            'is_active' => true,
        ]);

        $response = $this->postJson('/api/v1/queues', [
            'layanan_id' => $layanan->id,
            'service_type' => 'Umum',
            'customer_name' => 'Test',
        ]);
        $response->assertStatus(201);
    }

    public function test_display_listing_stays_public(): void
    {
        $response = $this->getJson('/api/v1/displays');
        $response->assertOk();
    }

    public function test_layanan_listing_stays_public(): void
    {
        $response = $this->getJson('/api/v1/layanans');
        $response->assertOk();
    }
}
