<?php

namespace App\Services;

use App\Models\Queue;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Symfony\Component\Process\Process;

class DynamicAnnouncerService
{
    public function audioUrlForQueue(Queue $queue): string
    {
        $text = $this->announcementTextForQueue($queue);

        return $this->audioUrlForText($text, $queue->id . '-' . md5($text . '|' . $this->voiceName()));
    }

    public function announcementTextForQueue(Queue $queue): string
    {
        $queue->loadMissing(['counter', 'layanan']);

        $ticket = $this->speakableTicket($queue->ticket_number);
        $counter = $queue->counter?->name ?: 'loket yang dituju';

        return "Nomor antrian {$ticket}. Silakan menuju ke {$counter}. Sekali lagi, nomor antrian {$ticket}, menuju {$counter}.";
    }

    public function voiceName(): string
    {
        return env('DYNAMIC_TTS_VOICE', 'id-ID-GadisNeural');
    }

    public function usesEspeakFallback(): bool
    {
        return false;
    }

    public function audioUrlForText(string $text, string $key): string
    {
        $safeKey = preg_replace('/[^a-zA-Z0-9_-]/', '-', $key) ?: Str::uuid()->toString();
        $relativeWav = "announcers/dynamic/{$safeKey}.wav";

        if (Storage::disk('public')->exists($relativeWav)) {
            return "/storage/{$relativeWav}";
        }

        $directory = storage_path('app/public/announcers/dynamic');
        File::ensureDirectoryExists($directory, 0775, true);

        $mp3 = "{$directory}/{$safeKey}.mp3";
        $wav = "{$directory}/{$safeKey}.wav";

        $this->generateMp3WithEdgeTts($text, $mp3);
        $this->convertMp3ToTvSafeWav($mp3, $wav);

        if (! File::exists($wav)) {
            throw new RuntimeException("Dynamic TTS failed: WAV was not created at {$wav}");
        }

        File::delete($mp3);

        return "/storage/{$relativeWav}";
    }

    private function generateMp3WithEdgeTts(string $text, string $mp3): void
    {
        $python = env('DYNAMIC_TTS_PYTHON', 'python3');
        $voice = $this->voiceName();
        $rate = env('DYNAMIC_TTS_RATE', '-5%');
        $volume = env('DYNAMIC_TTS_VOLUME', '+0%');

        $process = new Process([
            $python,
            '-m',
            'edge_tts',
            '--voice',
            $voice,
            "--rate={$rate}",
            "--volume={$volume}",
            '--text',
            $text,
            '--write-media',
            $mp3,
        ]);
        $process->setTimeout(45);
        $process->run();

        if (! $process->isSuccessful() || ! File::exists($mp3)) {
            $message = trim($process->getErrorOutput() ?: $process->getOutput());
            throw new RuntimeException(
                'Dynamic TTS failed: edge-tts Indonesian voice unavailable. Install with `python3 -m pip install edge-tts` and verify voice `'
                . $voice
                . '`. '
                . $message
            );
        }
    }

    private function convertMp3ToTvSafeWav(string $mp3, string $wav): void
    {
        $ffmpeg = env('DYNAMIC_TTS_FFMPEG', 'ffmpeg');

        $process = new Process([
            $ffmpeg,
            '-y',
            '-i',
            $mp3,
            '-ar',
            '22050',
            '-ac',
            '1',
            '-c:a',
            'pcm_s16le',
            $wav,
        ]);
        $process->setTimeout(45);
        $process->run();

        if (! $process->isSuccessful() || ! File::exists($wav)) {
            $message = trim($process->getErrorOutput() ?: $process->getOutput());
            throw new RuntimeException(
                'Dynamic TTS failed: ffmpeg could not convert edge-tts MP3 to Samsung TV-safe WAV. '
                . $message
            );
        }
    }

    private function speakableTicket(?string $ticket): string
    {
        $ticket = trim((string) $ticket);
        if ($ticket === '') {
            return 'tidak diketahui';
        }

        $parts = preg_split('/([0-9]+)/', $ticket, -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY);

        return collect($parts)
            ->map(fn ($part) => ctype_digit($part) ? $this->speakDigits($part) : implode(' ', preg_split('//u', $part, -1, PREG_SPLIT_NO_EMPTY)))
            ->implode(' ');
    }

    private function speakDigits(string $digits): string
    {
        $words = [
            '0' => 'nol',
            '1' => 'satu',
            '2' => 'dua',
            '3' => 'tiga',
            '4' => 'empat',
            '5' => 'lima',
            '6' => 'enam',
            '7' => 'tujuh',
            '8' => 'delapan',
            '9' => 'sembilan',
        ];

        return collect(str_split($digits))
            ->map(fn ($digit) => $words[$digit] ?? $digit)
            ->implode(' ');
    }
}
