<?php

namespace Tests\Feature;

use App\Models\Display;
use App\Models\User;
use App\Models\Video;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Regression for the 422 validation.boolean on is_active during
 * the Edit-with-Replace flow.
 *
 * Bug history: VideoUploadCard.handleSave() built a FormData payload
 * with formData.append("is_active", String(isActive)), producing
 * the literal strings "true"/"false". Laravel's boolean rule only
 * accepts [true, false, 0, 1, "0", "1"], so the strings were
 * rejected with validation.boolean -> 422. The frontend fix sends
 * "1" / "0" instead, which the validator accepts.
 *
 * This test asserts that a multipart PUT (POST + _method=PUT, like
 * updateVideoWithFile in the frontend) carrying is_active=0 or
 * is_active=1 alongside a video file returns 200, not 422.
 */
class VideoEditReplaceRegressionTest extends TestCase
{
    use RefreshDatabase;

    public function test_edit_with_replace_with_is_active_zero_succeeds(): void
    {
        Storage::fake('public');

        $admin = User::factory()->create(['role' => 'super']);
        $this->actingAs($admin, 'sanctum');

        $display = Display::create(['name' => 'Main', 'location' => 'Lobby']);
        $video = Video::create([
            'display_id' => $display->id,
            'file_url' => '/storage/videos/old.mp4',
            'title' => 'old',
            'is_active' => true,
            'playlist_order' => 0,
        ]);

        $file = UploadedFile::fake()->create('new.mp4', 64, 'video/mp4');

        // Mirror exactly what the patched frontend sends after the fix:
        // a real PUT multipart from updateVideoWithFile's POST -> _method=PUT spoof.
        // In the testing harness, we call the route's method directly.
        $response = $this->call(
            'PUT',
            "/api/v1/videos/{$video->id}",
            [
                'video' => $file,
                'title' => 'updated',
                'is_active' => '0',     // <-- the patch payload
                'playlist_order' => '5',
            ],
            [],
            [],
            ['CONTENT_TYPE' => 'multipart/form-data'],
        );

        $response->assertStatus(200);
        $response->assertJsonPath('data.is_active', false);
        $response->assertJsonPath('data.playlist_order', 5);
    }

    public function test_edit_with_replace_with_is_active_one_succeeds(): void
    {
        Storage::fake('public');

        $admin = User::factory()->create(['role' => 'super']);
        $this->actingAs($admin, 'sanctum');

        $display = Display::create(['name' => 'Main', 'location' => 'Lobby']);
        $video = Video::create([
            'display_id' => $display->id,
            'file_url' => '/storage/videos/old.mp4',
            'title' => 'old',
            'is_active' => false,
            'playlist_order' => 0,
        ]);

        $file = UploadedFile::fake()->create('new.mp4', 64, 'video/mp4');

        $response = $this->call(
            'PUT',
            "/api/v1/videos/{$video->id}",
            [
                'video' => $file,
                'title' => 'updated on',
                'is_active' => '1',     // <-- the patch payload
                'playlist_order' => '1',
            ],
            [],
            [],
            ['CONTENT_TYPE' => 'multipart/form-data'],
        );

        $response->assertStatus(200);
        $response->assertJsonPath('data.is_active', true);
    }

    public function test_unpatched_string_true_is_still_rejected_as_a_lock(): void
    {
        // This is the original broken behavior the frontend shipped.
        // Asserting it remains rejected prevents a future validator
        // loosening from masking a regression in formData construction.
        Storage::fake('public');

        $admin = User::factory()->create(['role' => 'super']);
        $this->actingAs($admin, 'sanctum');

        $display = Display::create(['name' => 'Main', 'location' => 'Lobby']);
        $video = Video::create([
            'display_id' => $display->id,
            'file_url' => '/storage/videos/old.mp4',
            'title' => 'old',
            'is_active' => false,
            'playlist_order' => 0,
        ]);

        $file = UploadedFile::fake()->create('new.mp4', 64, 'video/mp4');

        $response = $this->call(
            'PUT',
            "/api/v1/videos/{$video->id}",
            [
                'video' => $file,
                'title' => 'updated',
                'is_active' => 'true', // the buggy pre-fix payload
                'playlist_order' => '0',
            ],
            [],
            [],
            ['CONTENT_TYPE' => 'multipart/form-data'],
        );

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['is_active']);
    }
}
