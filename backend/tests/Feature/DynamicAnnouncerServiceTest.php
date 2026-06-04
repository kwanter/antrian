<?php

namespace Tests\Feature;

use App\Models\Counter;
use App\Models\Queue;
use App\Services\DynamicAnnouncerService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class DynamicAnnouncerServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_builds_fluent_indonesian_announcement_text_with_speakable_ticket(): void
    {
        $counter = Counter::factory()->create(['name' => 'Loket Pidana']);
        $queue = Queue::create([
            'ticket_number' => 'PID001',
            'service_type' => 'pidana',
            'status' => 'called',
            'counter_id' => $counter->id,
        ]);

        $service = app(DynamicAnnouncerService::class);

        $this->assertSame(
            'Nomor antrian P I D nol nol satu. Silakan menuju ke Loket Pidana. Sekali lagi, nomor antrian P I D nol nol satu, menuju Loket Pidana.',
            $service->announcementTextForQueue($queue)
        );
    }

    public function test_uses_female_indonesian_neural_voice_and_never_espeak(): void
    {
        $service = app(DynamicAnnouncerService::class);

        $this->assertSame('id-ID-GadisNeural', $service->voiceName());
        $this->assertFalse($service->usesEspeakFallback());
    }

    public function test_tts_endpoint_returns_dynamic_wav_url_and_metadata(): void
    {
        Storage::fake('public');

        $counter = Counter::factory()->create(['name' => 'Loket Perdata']);
        $queue = Queue::create([
            'ticket_number' => 'A012',
            'service_type' => 'general',
            'status' => 'called',
            'counter_id' => $counter->id,
        ]);

        $service = $this->partialMock(DynamicAnnouncerService::class, function ($mock) {
            $mock->shouldReceive('audioUrlForQueue')->once()->andReturn('/storage/announcers/dynamic/test.wav');
            $mock->shouldReceive('announcementTextForQueue')->once()->andReturn('Nomor antrian A nol satu dua. Silakan menuju ke Loket Perdata.');
            $mock->shouldReceive('voiceName')->once()->andReturn('id-ID-GadisNeural');
        });

        $this->app->instance(DynamicAnnouncerService::class, $service);

        $this->getJson("/api/v1/tts/queue/{$queue->id}")
            ->assertOk()
            ->assertJsonPath('audio_url', '/storage/announcers/dynamic/test.wav')
            ->assertJsonPath('ticket_number', 'A012')
            ->assertJsonPath('counter', 'Loket Perdata')
            ->assertJsonPath('voice', 'id-ID-GadisNeural')
            ->assertJsonPath('text', 'Nomor antrian A nol satu dua. Silakan menuju ke Loket Perdata.');
    }
}
