<?php

namespace Tests\Feature;

use App\Models\Display;
use App\Models\Video;
use App\Services\DisplayCompositeService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class DisplayCompositeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        config([
            'display_composite.state_path' => Storage::disk('public')->path('test-private-state'),
            'display_composite.ffmpeg' => '/opt/homebrew/bin/ffmpeg',
            'display_composite.ffprobe' => '/opt/homebrew/bin/ffprobe',
            'display_composite.width' => 320,
            'display_composite.height' => 180,
            'display_composite.duration' => 2,
        ]);
    }

    private function service(): DisplayCompositeService
    {
        $this->assertTrue(class_exists(DisplayCompositeService::class), 'Composite service must exist.');

        return app(DisplayCompositeService::class);
    }

    private function panel(int $number, bool $active = true): Display
    {
        return Display::create([
            'name' => "Display {$number}", 'location' => 'Lobby', 'is_active' => $active,
            'settings' => ['volume' => $number === 1 ? 0.2 : 0.7],
        ]);
    }

    private function clip(Display $display, string $name, int $order = 0, bool $active = true): Video
    {
        return Video::create([
            'display_id' => $display->id, 'title' => $name, 'file_url' => "/storage/videos/{$name}.mp4",
            'is_active' => $active, 'playlist_order' => $order, 'volume_level' => 0.5,
        ]);
    }

    public function test_public_status_is_read_only_and_reports_unavailable_before_first_build(): void
    {
        $this->getJson('/api/v1/display-composite')->assertOk()
            ->assertJsonPath('data.status', 'unavailable')->assertJsonPath('data.video_url', null);
        $this->assertFalse(is_dir(config('display_composite.state_path')));
    }

    public function test_snapshot_selects_active_displays_and_active_ordered_playlists(): void
    {
        $one = $this->panel(1);
        $two = $this->panel(2);
        $off = $this->panel(3, false);
        foreach (['late', 'early', 'disabled', 'off'] as $name) {
            Storage::disk('public')->put("videos/{$name}.mp4", 'fixture');
        }
        $this->clip($one, 'late', 2);
        $early = $this->clip($one, 'early', 1);
        $this->clip($one, 'disabled', 0, false);
        $this->clip($off, 'off');
        $snapshot = $this->service()->snapshot();
        $this->assertSame([$one->id, $two->id], array_column($snapshot['panels'], 'id'));
        $this->assertSame($early->id, $snapshot['panels'][0]['videos'][0]['id']);
        $this->assertCount(2, $snapshot['panels'][0]['videos']);
        $this->assertSame([], $snapshot['panels'][1]['videos']);
        $this->assertSame(0.2, $snapshot['panels'][0]['volume']);
    }

    public function test_signature_changes_with_volume_order_and_replaced_source(): void
    {
        $panel = $this->panel(1);
        Storage::disk('public')->put('videos/a.mp4', 'initial');
        $clip = $this->clip($panel, 'a');
        $first = $this->service()->snapshot()['signature'];
        $this->assertSame($first, $this->service()->snapshot()['signature']);
        $panel->update(['settings' => ['volume' => 0.4]]);
        $second = $this->service()->snapshot()['signature'];
        $this->assertNotSame($first, $second);
        $clip->update(['playlist_order' => 2]);
        $third = $this->service()->snapshot()['signature'];
        $this->assertNotSame($second, $third);
        Storage::disk('public')->put('videos/a.mp4', 'replacement with a different length');
        $this->assertNotSame($third, $this->service()->snapshot()['signature']);
    }

    public function test_rejects_remote_and_traversal_sources_without_publishing_paths(): void
    {
        $panel = $this->panel(1);
        $clip = $this->clip($panel, 'bad');
        foreach (['https://example.com/video.mp4', '/storage/videos/../../secret.mp4', '/storage/videos/%2e%2e/x.mp4'] as $url) {
            $clip->update(['file_url' => $url]);
            try {
                $this->service()->snapshot();
                $this->fail('Unsafe video source must be rejected.');
            } catch (\RuntimeException $error) {
                $this->assertStringContainsString('local', strtolower($error->getMessage()));
            }
        }
        $this->getJson('/api/v1/display-composite')->assertOk()->assertDontSee('secret.mp4');
    }

    public function test_rejects_symlink_escape_from_the_videos_directory(): void
    {
        $panel = $this->panel(1);
        Storage::disk('public')->makeDirectory('videos');
        Storage::disk('public')->put('outside.mp4', 'private fixture');
        symlink(Storage::disk('public')->path('outside.mp4'), Storage::disk('public')->path('videos/link.mp4'));
        $this->clip($panel, 'link');
        $this->expectException(\RuntimeException::class);
        $this->service()->snapshot();
    }

    public function test_rejects_more_than_eight_panels_before_starting_processes(): void
    {
        for ($i = 1; $i <= 9; $i++) {
            $this->panel($i);
        }
        $this->expectException(\RuntimeException::class);
        $this->service()->snapshot();
    }

    public function test_empty_configuration_withdraws_previous_output(): void
    {
        $this->assertSame('empty', $this->service()->build());
        $this->getJson('/api/v1/display-composite')->assertOk()
            ->assertJsonPath('data.status', 'empty')->assertJsonPath('data.video_url', null);
    }

    public function test_rejects_more_than_64_active_sources(): void
    {
        $panel = $this->panel(1);
        Storage::disk('public')->put('videos/a.mp4', 'fixture');
        for ($i = 0; $i < 65; $i++) {
            $this->clip($panel, 'a', $i);
        }
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('64');
        $this->service()->snapshot();
    }

    public function test_an_existing_filesystem_lock_prevents_a_second_renderer(): void
    {
        File::ensureDirectoryExists(config('display_composite.state_path'));
        $lock = fopen(config('display_composite.state_path').'/compose.lock', 'c');
        flock($lock, LOCK_EX);
        try {
            $this->assertSame('busy', $this->service()->build());
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    public function test_operator_command_reports_empty_and_fails_safely_on_invalid_input(): void
    {
        $this->artisan('displays:compose')->expectsOutput('Composite: empty')->assertSuccessful();
        $panel = $this->panel(1);
        $clip = $this->clip($panel, 'remote');
        $clip->update(['file_url' => 'https://example.com/remote.mp4']);
        $this->artisan('displays:compose')->expectsOutput('Composite generation failed; check the application log.')
            ->assertFailed();
        $this->getJson('/api/v1/display-composite')->assertOk()
            ->assertJsonPath('data.status', 'error')->assertJsonPath('data.video_url', null)
            ->assertDontSee('example.com');
    }

    public function test_next_locked_build_cleans_only_owned_stale_crash_artifacts(): void
    {
        $state = config('display_composite.state_path');
        $staleWork = $state.'/work-'.str_repeat('a', 24);
        $freshWork = $state.'/work-'.str_repeat('b', 24);
        File::ensureDirectoryExists($staleWork);
        File::ensureDirectoryExists($freshWork);
        File::put($staleWork.'/clip.mp4', 'abandoned scratch');
        touch($staleWork, time() - 2000);
        Storage::disk('public')->makeDirectory('composites');
        $stalePart = Storage::disk('public')->path('composites/.'.str_repeat('c', 24).'.part');
        $unrelated = Storage::disk('public')->path('composites/not-owned.part');
        File::put($stalePart, 'abandoned partial');
        File::put($unrelated, 'preserve');
        touch($stalePart, time() - 2000);
        $this->assertSame('empty', $this->service()->build());
        $this->assertDirectoryDoesNotExist($staleWork);
        $this->assertFileDoesNotExist($stalePart);
        $this->assertDirectoryExists($freshWork);
        $this->assertFileExists($unrelated);
    }

    public function test_real_render_is_single_h264_aac_file_cached_and_preserved_after_failure(): void
    {
        if (! is_executable('/opt/homebrew/bin/ffmpeg')) {
            $this->markTestSkipped('Real FFmpeg fixture test requires ffmpeg and ffprobe.');
        }
        Storage::disk('public')->makeDirectory('videos');
        $one = $this->panel(1);
        $two = $this->panel(2);
        foreach ([['red', $one], ['blue', $two]] as [$color, $panel]) {
            $path = Storage::disk('public')->path("videos/{$color}.mp4");
            (new Process([
                '/opt/homebrew/bin/ffmpeg', '-v', 'error', '-nostdin', '-f', 'lavfi',
                '-i', "color=c={$color}:s=160x180:r=25:d=1", '-t', '1',
                '-c:v', 'libx264', '-pix_fmt', 'yuv420p', $path,
            ]))->mustRun();
            $this->clip($panel, $color);
        }
        $service = $this->service();
        $this->assertSame('ready', $service->build());
        $status = $this->getJson('/api/v1/display-composite')->assertOk()->json('data');
        $this->assertSame('ready', $status['status']);
        $this->assertMatchesRegularExpression('~^/storage/composites/[a-f0-9]{64}\.mp4$~', $status['video_url']);
        $output = Storage::disk('public')->path(substr($status['video_url'], strlen('/storage/')));
        $probe = new Process(['/opt/homebrew/bin/ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', $output]);
        $probe->mustRun();
        $media = json_decode($probe->getOutput(), true);
        $this->assertSame(['h264', 'aac'], array_column($media['streams'], 'codec_name'));
        $this->assertSame(320, $media['streams'][0]['width']);
        $this->assertSame(180, $media['streams'][0]['height']);
        $this->assertSame('yuv420p', $media['streams'][0]['pix_fmt']);
        $this->assertSame('Main', $media['streams'][0]['profile']);
        $this->assertLessThanOrEqual(41, $media['streams'][0]['level']);
        $this->assertEqualsWithDelta(2, (float) $media['format']['duration'], 0.2);
        $digest = hash_file('sha256', $output);
        config(['display_composite.ffmpeg' => '/missing/ffmpeg']);
        $this->assertSame('unchanged', $service->build(), 'Identical configuration must not start FFmpeg.');
        $one->update(['settings' => ['volume' => 0.9]]);
        try {
            $service->build();
            $this->fail('A failed renderer must report failure.');
        } catch (\RuntimeException $error) {
            $this->assertNotEmpty($error->getMessage());
        }
        $this->assertSame($digest, hash_file('sha256', $output));
        $this->getJson('/api/v1/display-composite')->assertOk()
            ->assertJsonPath('data.status', 'error')->assertJsonPath('data.video_url', $status['video_url'])
            ->assertDontSee('/missing/ffmpeg')->assertDontSee(config('display_composite.state_path'));
    }

    public function test_real_single_empty_panel_produces_a_valid_silent_composite(): void
    {
        if (! is_executable('/opt/homebrew/bin/ffmpeg')) {
            $this->markTestSkipped('Real FFmpeg fixture test requires ffmpeg and ffprobe.');
        }
        $panel = $this->panel(1);
        $this->assertSame('ready', $this->service()->build());
        $status = $this->service()->status();
        $this->assertSame([['id' => $panel->id, 'name' => $panel->name]], $status['displays']);
        $this->assertNotNull($status['video_url']);
        $this->assertSame('unchanged', $this->service()->build());
    }

    public function test_real_composite_preserves_panel_pixels_playlist_order_looping_and_muted_audio(): void
    {
        if (! is_executable('/opt/homebrew/bin/ffmpeg')) {
            $this->markTestSkipped('Real FFmpeg fixture test requires ffmpeg and ffprobe.');
        }
        config(['display_composite.duration' => 3]);
        Storage::disk('public')->makeDirectory('videos');
        $one = $this->panel(1);
        $one->update(['settings' => ['volume' => 0]]);
        $two = $this->panel(2);
        $this->panel(3); // Named display with an empty playlist occupies its own dark panel.
        foreach ([['red', $one, 0], ['lime', $one, 1], ['blue', $two, 0]] as [$color, $panel, $order]) {
            $args = ['/opt/homebrew/bin/ffmpeg', '-v', 'error', '-nostdin', '-f', 'lavfi',
                '-i', "color=c={$color}:s=160x90:r=25:d=1"];
            if ($color !== 'blue') {
                array_push($args, '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1', '-c:a', 'aac');
            }
            array_push($args, '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                Storage::disk('public')->path("videos/{$color}.mp4"));
            (new Process($args))->mustRun();
            $this->clip($panel, $color, $order);
        }
        $this->assertSame('ready', $this->service()->build());
        $status = $this->service()->status();
        $output = Storage::disk('public')->path(substr($status['video_url'], 9));
        $pixel = function (float $time, int $x) use ($output): array {
            $process = new Process(['/opt/homebrew/bin/ffmpeg', '-v', 'error', '-ss', (string) $time,
                '-i', $output, '-frames:v', '1', '-vf', "crop=2:2:{$x}:90,format=rgb24", '-f', 'rawvideo', 'pipe:1']);
            $process->mustRun();

            return array_values(unpack('C3', $process->getOutput()));
        };
        $this->assertGreaterThan(180, $pixel(0.4, 50)[0], 'First panel starts with its red video.');
        $this->assertGreaterThan(180, $pixel(1.4, 50)[1], 'First panel advances to its green video.');
        $this->assertGreaterThan(180, $pixel(2.5, 50)[0], 'First panel loops its own shorter playlist.');
        $this->assertGreaterThan(180, $pixel(1.4, 158)[2], 'Second panel keeps playing blue independently.');
        $this->assertLessThan(60, max($pixel(1.4, 264)), 'Empty display keeps a dark placeholder panel.');
        $decode = new Process(['/opt/homebrew/bin/ffmpeg', '-v', 'error', '-i', $output,
            '-vn', '-t', '0.5', '-f', 'f32le', 'pipe:1']);
        $decode->mustRun();
        $samples = unpack('g*', $decode->getOutput());
        $this->assertNotEmpty($samples);
        $this->assertLessThan(0.001, max(array_map('abs', $samples)), 'A zero-volume display stays silent after mixing.');
        $one->update(['settings' => ['volume' => 1]]);
        $this->assertSame('ready', $this->service()->build());
        $newOutput = Storage::disk('public')->path(substr($this->service()->status()['video_url'], 9));
        $decode = new Process(['/opt/homebrew/bin/ffmpeg', '-v', 'error', '-i', $newOutput,
            '-vn', '-t', '0.5', '-f', 'f32le', 'pipe:1']);
        $decode->mustRun();
        $this->assertGreaterThan(0.01, max(array_map('abs', unpack('g*', $decode->getOutput()))));
        Display::query()->update(['is_active' => false]);
        $this->assertSame('empty', $this->service()->build());
        $this->assertNull($this->service()->status()['video_url']);
    }
}
