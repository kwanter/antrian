<?php

use Illuminate\Support\Facades\Broadcast;

// Private channels — require an authenticated, authorized user.
// queue-updates: operator-facing lifecycle stream. F-22.
Broadcast::channel('queue-updates', function ($user) {
    return $user != null;
});

Broadcast::channel('display-sync', function () {
    return true;
});

Broadcast::channel('display-volume-updates', function () {
    return true;
});

// Private channels — require an authenticated, authorized user.
// loket.{counterId}: operators may subscribe only to counters they are
// assigned to (or admin/super for oversight). F-08.
Broadcast::channel('loket.{counterId}', function ($user, $counterId) {
    if (! $user) {
        return false;
    }

    // Admins/supers oversee all counters.
    if ($user->isAdmin() || $user->isSuper()) {
        return true;
    }

    // Loket: must be assigned to this counter (pivot) or have it as active.
    return (int) $user->counter_id === (int) $counterId
        || $user->assignedCounters()->where('counter_id', $counterId)->exists();
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