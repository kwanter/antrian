<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\KioskStation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Regression tests for the kiosk station surface.
 *
 * F-03 / F-18 (token leak) are closed by removing the infrastructure
 * entirely (Decision Log decision-kiosk-token, Option B). These tests
 * guard against the column or its generation logic coming back.
 *
 * AuditLog::log() central redaction is also covered — it still redacts
 * bridge_token as defense-in-depth for any historical log rows.
 */
class KioskStationTokenHygieneTest extends TestCase
{
    use RefreshDatabase;

    public function test_kiosk_stations_table_has_no_bridge_token_column(): void
    {
        $this->assertFalse(
            Schema::hasColumn('kiosk_stations', 'bridge_token'),
            'bridge_token column must be dropped (F-14 / decision-kiosk-token).'
        );
    }

    public function test_kiosk_station_factory_creates_without_bridge_token(): void
    {
        $station = KioskStation::factory()->create(['name' => 'Kiosk 1']);

        $this->assertSame('Kiosk 1', $station->name);
        $this->assertNull($station->bridge_token ?? null);
    }

    public function test_admin_index_returns_stations_without_token_field(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        KioskStation::factory()->create(['name' => 'Kiosk A']);

        $response = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/kiosk-stations');

        $response->assertOk();
        $this->assertStringNotContainsString('bridge_token', $response->getContent());
    }

    public function test_store_creates_station_without_token(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/kiosk-stations', [
                'name' => 'New Kiosk',
            ]);

        $response->assertCreated();
        $this->assertStringNotContainsString('bridge_token', $response->getContent());
    }

    public function test_regenerate_token_route_is_removed(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $station = KioskStation::factory()->create();

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/kiosk-stations/{$station->id}/regenerate-token");

        $response->assertNotFound();
    }

    public function test_audit_log_still_redacts_bridge_token_defense_in_depth(): void
    {
        // Historical log rows written before the column was dropped may still
        // contain bridge_token snapshots. AuditLog::log() must keep redacting
        // it so those rows cannot leak via the admin audit viewer.
        $admin = User::factory()->create(['role' => 'admin']);

        AuditLog::log(
            action: 'update',
            model: 'KioskStation',
            modelId: 1,
            changes: [
                'before' => ['name' => 'Old', 'bridge_token' => 'historical-secret'],
                'after' => ['name' => 'New', 'bridge_token' => 'historical-secret-2'],
            ],
            ipAddress: '127.0.0.1',
            userId: $admin->id,
        );

        $entry = AuditLog::latest('id')->first();
        $this->assertSame('(redacted)', $entry->changes['before']['bridge_token']);
        $this->assertSame('(redacted)', $entry->changes['after']['bridge_token']);
        $this->assertSame('Old', $entry->changes['before']['name']);
    }

    public function test_audit_log_redacts_password_and_remember_token(): void
    {
        AuditLog::log(
            action: 'update',
            model: 'User',
            modelId: 1,
            changes: [
                'before' => ['password' => 'hashed-secret', 'remember_token' => 'rt'],
                'email' => 'x@y.local',
            ],
        );

        $entry = AuditLog::latest('id')->first();
        $this->assertSame('(redacted)', $entry->changes['before']['password']);
        $this->assertSame('(redacted)', $entry->changes['before']['remember_token']);
        $this->assertSame('x@y.local', $entry->changes['email']);
    }
}
