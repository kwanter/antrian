<?php

namespace Tests\Feature;

use App\Models\Display;
use App\Models\PrinterProfile;
use App\Models\User;
use App\Models\Video;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Regression tests for Cluster 6 (Deferred Hardening).
 *
 * F-10: file_url is not client-settable on video update.
 * F-17: password policy requires >= 10 chars.
 * F-36: unknown printer template keys are stripped on write.
 * F-35: audit-log filter params are validated.
 */
class HardeningGuardrailsTest extends TestCase
{
    use RefreshDatabase;

    public function test_video_update_ignores_client_supplied_file_url(): void
    {
        Storage::fake('public');
        $admin = User::factory()->create(['role' => 'admin']);
        $display = Display::create(['name' => 'Main', 'location' => 'Lobby']);
        $video = Video::create([
            'display_id' => $display->id,
            'file_url' => '/storage/videos/original.mp4',
            'title' => 'Original',
            'is_active' => true,
            'playlist_order' => 0,
        ]);

        // F-10: attempt to inject an external file_url — must be ignored.
        $response = $this->actingAs($admin, 'sanctum')
            ->putJson("/api/v1/videos/{$video->id}", [
                'title' => 'Renamed',
                'file_url' => 'http://evil.internal/malicious.mp4',
            ]);

        $response->assertOk();
        $this->assertSame('/storage/videos/original.mp4', $video->fresh()->file_url);
        $this->assertSame('Renamed', $video->fresh()->title);
    }

    public function test_video_update_replaces_file_and_deletes_old(): void
    {
        Storage::fake('public');
        $admin = User::factory()->create(['role' => 'admin']);
        $display = Display::create(['name' => 'Main', 'location' => 'Lobby']);

        // Seed an "old" managed file on the fake disk.
        Storage::disk('public')->put('videos/old.mp4', 'old-bytes');
        $video = Video::create([
            'display_id' => $display->id,
            'file_url' => '/storage/videos/old.mp4',
            'title' => 'Old',
            'is_active' => true,
            'playlist_order' => 0,
        ]);

        $newFile = \Illuminate\Http\UploadedFile::fake()->create('new.mp4', 64, 'video/mp4');

        $response = $this->actingAs($admin, 'sanctum')->call(
            'PUT',
            "/api/v1/videos/{$video->id}",
            ['title' => 'New', 'is_active' => '1'],
            [],
            ['video' => $newFile],
            ['CONTENT_TYPE' => 'multipart/form-data'],
        );

        $response->assertOk();
        // F-26: old managed file deleted.
        Storage::disk('public')->assertMissing('videos/old.mp4');
        // New file_url points to the uploaded file.
        $this->assertStringStartsWith('/storage/videos/', $video->fresh()->file_url);
        $this->assertNotSame('/storage/videos/old.mp4', $video->fresh()->file_url);
    }

    public function test_user_create_rejects_short_password(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/users', [
                'name' => 'Short',
                'email' => 'short@test.local',
                'password' => 'short',
                'role' => 'loket',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['password']);
    }

    public function test_user_create_accepts_long_password(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/users', [
                'name' => 'LongPass',
                'email' => 'long@test.local',
                'password' => 'longenough10',
                'role' => 'loket',
            ])
            ->assertStatus(201);
    }

    public function test_printer_profile_strips_unknown_template_keys(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/printer-profiles', [
                'name' => 'Profile A',
                'paper_size' => '58mm',
                'template' => [
                    'connection_type' => 'web_serial',
                    'baud_rate' => 9600,
                    'evil_key' => 'should-be-stripped',
                    'another_junk' => ['nested' => true],
                ],
            ]);

        $response->assertCreated();
        $profile = PrinterProfile::latest('id')->first();

        $this->assertArrayHasKey('connection_type', $profile->template);
        $this->assertArrayNotHasKey('evil_key', $profile->template);
        $this->assertArrayNotHasKey('another_junk', $profile->template);
    }

    public function test_audit_log_filter_rejects_invalid_params(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        // F-35: non-integer user_id must be rejected, not silently ignored.
        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/audit-logs?user_id=not-a-number')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['user_id']);

        // Malformed date must be rejected.
        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/audit-logs?start_date=not-a-date')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['start_date']);
    }
}
