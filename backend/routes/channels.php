<?php

use Illuminate\Support\Facades\Broadcast;

// Public channels (no auth required) - always available
Broadcast::channel('queue-updates', function () {
    return true;
});

Broadcast::channel('display-sync', function () {
    return true;
});

Broadcast::channel('display-volume-updates', function () {
    return true;
});

// Protected channels (auth required)
Broadcast::channel('loket.{counterId}', function ($user, $counterId) {
    return $user != null;
});

Broadcast::channel('queue.{queueId}', function ($user, $queueId) {
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