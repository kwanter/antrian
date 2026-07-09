<?php

namespace Tests\Feature;

use App\Http\Resources\PublicDisplayResource;
use App\Http\Resources\PublicPrinterProfileResource;
use App\Http\Resources\PublicQueueResource;
use App\Http\Resources\PublicVideoResource;
use App\Models\Counter;
use App\Models\Display;
use App\Models\PrinterProfile;
use App\Models\Queue;
use App\Models\Video;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression tests for Cluster 5 (Model Serialization & DTO Hardening).
 *
 * Verifies that the public-facing DTOs exclude PII (F-09), non-allowlisted
 * display settings (F-19/F-20), the full display relation on videos (F-20),
 * and peripheral printer-profile config (F-23).
 */
class PublicResourceHygieneTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_queue_resource_excludes_customer_pii(): void
    {
        $counter = Counter::factory()->create();
        $queue = Queue::create([
            'ticket_number' => 'A001',
            'service_type' => 'CS',
            'counter_id' => $counter->id,
            'customer_name' => 'Budi',
            'customer_phone' => '081234567890',
            'status' => 'called',
            'created_at' => now(),
        ]);

        $payload = (new PublicQueueResource($queue->load('counter')))
            ->resolve();

        $this->assertArrayNotHasKey('customer_name', $payload);
        $this->assertArrayNotHasKey('customer_phone', $payload);
        $this->assertSame('A001', $payload['ticket_number']);
    }

    public function test_display_sync_response_omits_customer_pii(): void
    {
        $counter = Counter::factory()->create();
        $display = Display::create([
            'name' => 'Main',
            'location' => 'Lobby',
            'settings' => ['counter_id' => $counter->id, 'volume' => 0.8],
        ]);

        Queue::create([
            'ticket_number' => 'B001',
            'service_type' => 'CS',
            'counter_id' => $counter->id,
            'customer_name' => 'Siti',
            'customer_phone' => '089876543210',
            'status' => 'called',
            'called_at' => now(),
            'created_at' => now(),
        ]);

        $response = $this->getJson("/api/v1/displays/{$display->id}/sync");

        $response->assertOk();
        $body = $response->getContent();

        // PII must not appear anywhere in the sync payload.
        $this->assertStringNotContainsString('Siti', $body);
        $this->assertStringNotContainsString('089876543210', $body);
        $this->assertStringNotContainsString('customer_phone', $body);
        $this->assertStringNotContainsString('customer_name', $body);
    }

    public function test_public_display_resource_only_allows_safe_settings_keys(): void
    {
        $display = Display::create([
            'name' => 'Side',
            'location' => 'Hall',
            'settings' => [
                'volume' => 0.5,
                'counter_id' => null,
                'junk_key' => 'should-not-appear',
                'announcer_sound_url' => '/storage/announcer/beep.mp3',
                'announcer_enabled' => true,
            ],
        ]);

        $payload = (new PublicDisplayResource($display))->resolve();
        $settings = $payload['settings'];

        // Allowlisted operational keys are kept.
        $this->assertArrayHasKey('volume', $settings);
        $this->assertArrayHasKey('announcer_enabled', $settings);
        $this->assertArrayHasKey('announcer_sound_url', $settings);
        // Arbitrary admin-stored keys are dropped (F-19).
        $this->assertArrayNotHasKey('junk_key', $settings);
    }

    public function test_public_video_resource_drops_full_display_relation(): void
    {
        $display = Display::create([
            'name' => 'Main',
            'location' => 'Lobby',
            'settings' => ['secret' => 'leak'],
        ]);
        $video = Video::create([
            'display_id' => $display->id,
            'file_url' => '/storage/videos/x.mp4',
            'title' => 'Ad',
            'is_active' => true,
            'playlist_order' => 0,
        ]);

        $payload = (new PublicVideoResource($video->load('display')))->resolve();

        $this->assertSame($display->id, $payload['display_id']);
        $this->assertSame('Main', $payload['display_name']);
        $this->assertArrayNotHasKey('display', $payload);
        $this->assertArrayNotHasKey('settings', $payload);
    }

    public function test_public_printer_profile_resource_keeps_template_restricts_logo_url(): void
    {
        // F-23: logo_url is restricted to local /storage/ paths (external URLs
        // dropped). template is preserved because the kiosk reads its
        // connection_type, baud_rate, cut_mode fields.
        $profile = PrinterProfile::create([
            'name' => 'Default',
            'paper_size' => '58mm',
            'copy_count' => 1,
            'header_text' => 'Header',
            'footer_text' => 'Footer',
            'logo_url' => 'http://internal.example.com/logo.png',
            'template' => [
                'connection_type' => 'web_serial',
                'baud_rate' => 9600,
                'printer_model' => 'Iware',
            ],
        ]);

        $payload = (new PublicPrinterProfileResource($profile))->resolve();

        // template kept — kiosk needs it.
        $this->assertIsArray($payload['template']);
        $this->assertSame('web_serial', $payload['template']['connection_type']);
        // external logo URL dropped (F-23).
        $this->assertNull($payload['logo_url']);
        $this->assertSame('Header', $payload['header_text']);
    }

    public function test_public_printer_profile_resource_keeps_local_logo_url(): void
    {
        $profile = PrinterProfile::create([
            'name' => 'Default',
            'paper_size' => '80mm',
            'logo_url' => '/storage/logos/x.png',
        ]);

        $payload = (new PublicPrinterProfileResource($profile))->resolve();

        $this->assertSame('/storage/logos/x.png', $payload['logo_url']);
    }
}
