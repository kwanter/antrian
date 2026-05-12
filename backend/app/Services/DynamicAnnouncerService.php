<?php

namespace App\Services;

use App\Models\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;

class DynamicAnnouncerService
{
    public function audioUrlForQueue(Queue $queue): string
    {
        $queue->loadMissing(['counter', 'layanan']);

        $ticket = $this->speakableTicket($queue->ticket_number);
        $counter = $queue->counter?->name ?: 'loket yang ditentukan';
        $text = "Nomor antrian {$ticket}, silakan menuju ke {$counter}.";

        return $this->audioUrlForText($text, $queue->id . '-' . md5($text));
    }

    public function audioUrlForText(string $text, string $key): string
    {
        $safeKey = preg_replace('/[^a-zA-Z0-9_-]/', '-', $key) ?: Str::uuid()->toString();
        $relativeMp3 = "announcers/dynamic/{$safeKey}.mp3";

        if (Storage::disk('public')->exists($relativeMp3)) {
            return "/storage/{$relativeMp3}";
        }

        Storage::disk('public')->makeDirectory('announcers/dynamic');

        $wav = storage_path("app/public/announcers/dynamic/{$safeKey}.wav");
        $mp3 = storage_path("app/public/{$relativeMp3}");

        $espeak = new Process(['espeak-ng', '-v', 'id', '-s', '145', '-p', '45', '-w', $wav, $text]);
        $espeak->setTimeout(20);
        $espeak->mustRun();

        $ffmpeg = new Process(['ffmpeg', '-y', '-i', $wav, '-codec:a', 'libmp3lame', '-b:a', '128k', $mp3]);
        $ffmpeg->setTimeout(30);
        $ffmpeg->mustRun();

        @unlink($wav);

        return "/storage/{$relativeMp3}";
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
