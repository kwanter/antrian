<?php

namespace App\Services;

use App\Models\Display;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Symfony\Component\Process\Process;
use Throwable;

class DisplayCompositeService
{
    private float $deadline = 0;

    /** Validated local inputs, ordered deterministically for change detection. */
    public function snapshot(): array
    {
        $displays = Display::query()->where('is_active', true)->orderBy('id')
            ->withCount('activeVideos')
            ->limit(9)->get();
        if ($displays->count() > 8) {
            throw new RuntimeException('Composite supports at most eight active displays.');
        }
        if ($displays->sum('active_videos_count') > 64) {
            throw new RuntimeException('Composite supports at most 64 active video sources.');
        }
        $displays->load(['activeVideos' => fn ($query) => $query->orderBy('playlist_order')->orderBy('id')->limit(65)]);

        $panels = [];
        $count = 0;
        foreach ($displays as $display) {
            $videos = [];
            foreach ($display->activeVideos as $video) {
                if (++$count > 64) {
                    throw new RuntimeException('Composite supports at most 64 active video sources.');
                }
                $path = $this->localVideoPath($video->file_url);
                clearstatcache(true, $path);
                $videos[] = [
                    'id' => $video->id, 'path' => $path, 'order' => $video->playlist_order,
                    'size' => filesize($path), 'modified' => filemtime($path), 'changed' => filectime($path),
                ];
            }
            $fallback = (float) ($display->activeVideos->first()?->volume_level ?? 1);
            $volume = (float) ($display->settings['volume'] ?? $fallback);
            $panels[] = [
                'id' => $display->id, 'name' => $display->name,
                'volume' => is_finite($volume) ? max(0, min(1, $volume)) : 0,
                'videos' => $videos,
            ];
        }

        $snapshot = ['version' => 2, 'format' => $this->format(), 'panels' => $panels];
        $snapshot['signature'] = hash('sha256', json_encode($snapshot, JSON_THROW_ON_ERROR));

        return $snapshot;
    }

    /** Read-only, deliberately exposing neither local paths nor encoder errors. */
    public function status(): array
    {
        $path = $this->statePath().'/status.json';
        $raw = is_file($path) ? json_decode(File::get($path), true) : [];
        $raw = is_array($raw) ? $raw : [];
        $url = $raw['video_url'] ?? null;
        if (! is_string($url) || ! preg_match('~\A/storage/composites/[a-f0-9]{64}\.mp4\z~D', $url)
            || ! is_file(Storage::disk('public')->path(substr($url, 9)))) {
            $url = null;
        }
        $state = $raw['status'] ?? 'unavailable';
        if (! in_array($state, ['ready', 'building', 'error', 'empty', 'unavailable'], true)) {
            $state = 'unavailable';
        }
        if ($state === 'ready' && $url === null) {
            $state = 'unavailable';
        }

        return [
            'status' => $state, 'video_url' => $url,
            'signature' => $url ? ($raw['signature'] ?? null) : null,
            'generated_at' => $url ? ($raw['generated_at'] ?? null) : null,
            'displays' => $url ? ($raw['displays'] ?? []) : [],
            'duration' => $this->format()['duration'],
            'message' => match ($state) {
                'building' => 'Video gabungan sedang disiapkan.',
                'empty' => 'Tidak ada display aktif.',
                'error' => 'Video gabungan gagal dibuat. Periksa proses render di server.',
                'unavailable' => 'Video gabungan belum tersedia. Jalankan proses render di server.',
                default => null,
            },
        ];
    }

    /** Called only by the operator-owned CLI process, never by a public GET. */
    public function build(): string
    {
        File::ensureDirectoryExists($this->statePath(), 0700);
        $lock = fopen($this->statePath().'/compose.lock', 'c');
        if ($lock === false) {
            throw new RuntimeException('Cannot open composite lock.');
        }
        if (! flock($lock, LOCK_EX | LOCK_NB)) {
            fclose($lock);

            return 'busy';
        }
        $previous = $this->status();
        $work = null;
        $pending = null;
        try {
            $this->cleanAbandonedWork();
            $snapshot = $this->snapshot();
            if ($snapshot['panels'] === []) {
                $this->writeStatus(['status' => 'empty', 'video_url' => null]);

                return 'empty';
            }
            if ($previous['video_url'] && $previous['signature'] === $snapshot['signature']) {
                if ($previous['status'] !== 'ready') {
                    $this->writeStatus([...$previous, 'status' => 'ready']);
                }

                return 'unchanged';
            }
            $this->writeStatus([...$previous, 'status' => 'building']);
            $this->deadline = microtime(true) + max(5, min(1800, (int) config('display_composite.timeout', 1800)));
            $token = bin2hex(random_bytes(12));
            $work = $this->statePath().'/work-'.$token;
            File::ensureDirectoryExists($work, 0700);
            $outputDir = Storage::disk('public')->path('composites');
            File::ensureDirectoryExists($outputDir);
            $pending = $outputDir.'/.'.$token.'.part';
            $this->render($snapshot, $work, $pending);
            $this->validateOutput($pending, $snapshot['format']);
            if ($this->snapshot()['signature'] !== $snapshot['signature']) {
                throw new RuntimeException('Display configuration changed during rendering; retry with current inputs.');
            }
            $filename = $snapshot['signature'].'.mp4';
            if (! rename($pending, $outputDir.'/'.$filename)) {
                throw new RuntimeException('Cannot publish composite output.');
            }
            $pending = null;
            $this->writeStatus([
                'status' => 'ready', 'video_url' => '/storage/composites/'.$filename,
                'signature' => $snapshot['signature'], 'generated_at' => now()->toIso8601String(),
                'displays' => array_map(fn ($panel) => ['id' => $panel['id'], 'name' => $panel['name']], $snapshot['panels']),
            ]);
            $this->pruneOutputs($outputDir, $filename);

            return 'ready';
        } catch (Throwable $error) {
            $this->writeStatus([...$previous, 'status' => 'error']);
            throw $error;
        } finally {
            if ($pending !== null && is_file($pending)) {
                File::delete($pending);
            }
            if ($work !== null) {
                File::deleteDirectory($work);
            }
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    private function localVideoPath(string $url): string
    {
        if (! preg_match('~\A/storage/videos/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:mp4|mov|webm|mkv|avi|ogv)\z~iD', $url)) {
            throw new RuntimeException('Composite requires local uploaded video files.');
        }
        $root = realpath(Storage::disk('public')->path('videos'));
        $path = realpath(Storage::disk('public')->path(substr($url, 9)));
        if ($root === false || $path === false || ! str_starts_with($path, $root.DIRECTORY_SEPARATOR)
            || ! is_file($path) || ! is_readable($path)) {
            throw new RuntimeException('Composite requires readable local video files inside the videos directory.');
        }

        return $path;
    }

    private function format(): array
    {
        return [
            'width' => intdiv(max(160, min(1920, (int) config('display_composite.width', 1920))), 2) * 2,
            'height' => intdiv(max(90, min(1080, (int) config('display_composite.height', 1080))), 2) * 2,
            'duration' => max(1, min(300, (int) config('display_composite.duration', 300))),
        ];
    }

    private function render(array $snapshot, string $work, string $output): void
    {
        $format = $snapshot['format'];
        $count = count($snapshot['panels']);
        $width = intdiv($format['width'], $count * 2) * 2;
        $height = $format['height'];
        $command = [$this->ffmpeg(), '-v', 'error', '-nostdin', '-y', '-filter_complex_threads', '1'];
        $filters = [];
        $videoLabels = '';
        $audioLabels = '';
        foreach ($snapshot['panels'] as $i => $panel) {
            $files = [];
            $remaining = (float) $format['duration'];
            foreach ($panel['videos'] as $j => $video) {
                if ($remaining <= 0) {
                    break;
                }
                $media = $this->probe($video['path']);
                $duration = min($remaining, (float) ($media['format']['duration'] ?? 0));
                if (! is_finite($duration) || $duration < 0.04 || ! in_array('video', array_column($media['streams'], 'codec_type'), true)) {
                    throw new RuntimeException('Video input has no finite playable video duration.');
                }
                $name = "clip-{$i}-{$j}.mp4";
                $this->normalize($video['path'], $work.'/'.$name, $width, $height, $duration,
                    in_array('audio', array_column($media['streams'], 'codec_type'), true));
                $files[] = "file '{$name}'";
                $remaining -= $duration;
            }
            if ($files === []) {
                $name = "empty-{$i}.mp4";
                $this->normalize(null, $work.'/'.$name, $width, $height, 1, false);
                $files[] = "file '{$name}'";
            }
            $playlist = $work."/playlist-{$i}.txt";
            File::put($playlist, implode("\n", $files)."\n");
            array_push($command, '-threads', '1', '-stream_loop', '-1', '-f', 'concat', '-safe', '1',
                '-protocol_whitelist', 'file,pipe', '-i', $playlist);
            $videoLabels .= "[{$i}:v]";
            $filters[] = "[{$i}:a]volume={$panel['volume']}[a{$i}]";
            $audioLabels .= "[a{$i}]";
        }
        $filters[] = $count > 1 ? $videoLabels."hstack=inputs={$count}[stack]" : '[0:v]null[stack]';
        $filters[] = "[stack]pad={$format['width']}:{$height}:(ow-iw)/2:0:black,setsar=1[v]";
        $filters[] = $audioLabels."amix=inputs={$count}:normalize=0,alimiter=level=false[a]";
        array_push($command, '-filter_complex', implode(';', $filters), '-map', '[v]', '-map', '[a]',
            '-t', (string) $format['duration']);
        $this->run([...$command, ...$this->encodeOptions(), '-f', 'mp4', $output]);
    }

    private function normalize(?string $source, string $output, int $width, int $height, float $duration, bool $audio): void
    {
        $command = [$this->ffmpeg(), '-v', 'error', '-nostdin', '-y', '-filter_threads', '1'];
        if ($source !== null) {
            array_push($command, '-threads', '1', '-protocol_whitelist', 'file,pipe', '-i', $source);
        } else {
            array_push($command, '-f', 'lavfi', '-i', "color=c=0x0f172a:s={$width}x{$height}:r=25");
        }
        if (! $audio) {
            array_push($command, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
        }
        $filter = "scale={$width}:{$height}:force_original_aspect_ratio=decrease:force_divisible_by=2,"
            ."pad={$width}:{$height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=25,format=yuv420p,"
            ."tpad=stop_mode=clone:stop_duration={$duration}";
        array_push($command, '-map', '0:v:0', '-map', $audio ? '0:a:0' : '1:a:0',
            '-vf', $filter, '-af', 'aresample=48000,apad', '-t', (string) $duration);
        $this->run([...$command, ...$this->encodeOptions(), $output]);
    }

    private function encodeOptions(): array
    {
        return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-threads', '2',
            '-profile:v', 'main', '-level:v', '4.0', '-maxrate', '8M', '-bufsize', '16M',
            '-pix_fmt', 'yuv420p', '-r', '25', '-c:a', 'aac', '-ar', '48000', '-ac', '2',
            '-b:a', '128k', '-movflags', '+faststart'];
    }

    private function validateOutput(string $path, array $format): void
    {
        $media = $this->probe($path);
        $video = collect($media['streams'])->firstWhere('codec_type', 'video');
        $audio = collect($media['streams'])->firstWhere('codec_type', 'audio');
        if (($video['codec_name'] ?? '') !== 'h264' || ($video['pix_fmt'] ?? '') !== 'yuv420p'
            || ($video['profile'] ?? '') !== 'Main' || ($video['level'] ?? 100) > 41
            || ($video['width'] ?? 0) !== $format['width'] || ($video['height'] ?? 0) !== $format['height']
            || ($audio['codec_name'] ?? '') !== 'aac'
            || abs((float) ($media['format']['duration'] ?? 0) - $format['duration']) > 0.25) {
            throw new RuntimeException('Composite output validation failed.');
        }
    }

    private function probe(string $path): array
    {
        $output = $this->run([(string) config('display_composite.ffprobe', 'ffprobe'), '-v', 'error',
            '-protocol_whitelist', 'file,pipe', '-show_streams', '-show_format', '-of', 'json', $path]);
        $media = json_decode($output, true, 512, JSON_THROW_ON_ERROR);
        if (! is_array($media['streams'] ?? null)) {
            throw new RuntimeException('Cannot inspect video streams.');
        }

        return $media;
    }

    private function run(array $command): string
    {
        $remaining = $this->deadline - microtime(true);
        if ($remaining <= 0) {
            throw new RuntimeException('Composite rendering exceeded the total time limit.');
        }
        $process = new Process($command);
        $process->setTimeout($remaining);
        $process->mustRun();

        return $process->getOutput();
    }

    private function ffmpeg(): string
    {
        return (string) config('display_composite.ffmpeg', 'ffmpeg');
    }

    private function statePath(): string
    {
        return (string) config('display_composite.state_path');
    }

    private function writeStatus(array $status): void
    {
        $temp = $this->statePath().'/status-'.bin2hex(random_bytes(8)).'.tmp';
        File::put($temp, json_encode($status, JSON_THROW_ON_ERROR), true);
        if (! rename($temp, $this->statePath().'/status.json')) {
            throw new RuntimeException('Cannot publish composite status.');
        }
    }

    private function pruneOutputs(string $directory, string $current): void
    {
        // Allow old TVs a full five-minute loop plus grace to fetch the new URL.
        // Never touch source uploads or unrelated files, only generated hashes.
        foreach (File::files($directory) as $file) {
            if ($file->getFilename() !== $current && preg_match('/\A[a-f0-9]{64}\.mp4\z/D', $file->getFilename())
                && $file->getMTime() < time() - 600) {
                File::delete($file->getPathname());
            }
        }
    }

    private function cleanAbandonedWork(): void
    {
        // Only called while holding the process-wide render lock. SIGKILL may
        // bypass finally; reap stale, strictly named artifacts on the next run.
        $cutoff = time() - max(5, min(1800, (int) config('display_composite.timeout', 1800)));
        foreach (File::directories($this->statePath()) as $directory) {
            if (! is_link($directory) && preg_match('/\Awork-[a-f0-9]{24}\z/D', basename($directory))
                && filemtime($directory) < $cutoff) {
                File::deleteDirectory($directory);
            }
        }
        $outputDir = Storage::disk('public')->path('composites');
        if (is_dir($outputDir)) {
            foreach (File::files($outputDir, true) as $file) {
                if (preg_match('/\A\.[a-f0-9]{24}\.part\z/D', $file->getFilename()) && $file->getMTime() < $cutoff) {
                    File::delete($file->getPathname());
                }
            }
        }
        foreach (File::files($this->statePath()) as $file) {
            if (preg_match('/\Astatus-[a-f0-9]{16}\.tmp\z/D', $file->getFilename()) && $file->getMTime() < $cutoff) {
                File::delete($file->getPathname());
            }
        }
    }
}
