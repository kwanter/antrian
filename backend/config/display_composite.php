<?php

return [
    // Rendering is opt-in: run `php artisan displays:compose --watch` separately.
    'ffmpeg' => env('DISPLAY_COMPOSITE_FFMPEG', env('DYNAMIC_TTS_FFMPEG', 'ffmpeg')),
    'ffprobe' => env('DISPLAY_COMPOSITE_FFPROBE', 'ffprobe'),
    'state_path' => storage_path('app/private/display-composite'),
    'width' => 1920,
    'height' => 1080,
    'duration' => 300,
    'timeout' => 1800,
    'poll_seconds' => 15,
];
