<?php

use Illuminate\Support\Facades\Broadcast;

// Check if Reverb is configured
$reverbEnabled = env('REVERB_ENABLED', false);

if ($reverbEnabled) {
    Broadcast::channel('queue', function () {
        return true;
    });

    Broadcast::channel('queue.{counterId}', function ($user, $counterId) {
        return $user != null;
    });

    Broadcast::channel('display.{displayId}', function () {
        return true;
    });

    Broadcast::channel('kiosk.{kioskId}', function ($user, $kioskId) {
        return $user != null;
    });

    Broadcast::channel('admin', function ($user) {
        return $user && $user->isAdmin();
    });
}