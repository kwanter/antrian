<?php

use App\Http\Controllers\Api\AuditLogsController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CountersController;
use App\Http\Controllers\Api\DisplaysController;
use App\Http\Controllers\Api\KioskStationsController;
use App\Http\Controllers\Api\LayananController;
use App\Http\Controllers\Api\PrinterProfilesController;
use App\Http\Controllers\Api\QueuesController;
use App\Http\Controllers\Api\TtsController;
use App\Http\Controllers\Api\UsersController;
use App\Http\Controllers\Api\VideosController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

// Public routes - no authentication required
Route::prefix('v1')->group(function () {
    // Auth
    Route::post('/auth/login', [AuthController::class, 'login']);

    // Kiosk — ticket creation (no auth required)
    Route::post('/queues', [QueuesController::class, 'store']);
    Route::get('/queues/stats', [QueuesController::class, 'stats']);

    // Display page routes — public for display monitors
    Route::get('/displays', [DisplaysController::class, 'index']);
    Route::get('/displays/{display}', [DisplaysController::class, 'show']);
    Route::get('/displays/{display}/sync', [DisplaysController::class, 'sync']);
    Route::get('/videos', [VideosController::class, 'index']);

    // Layanan — public for kiosk selection
    Route::get('/layanans', [LayananController::class, 'index']);
    Route::get('/layanans/{layanan}', [LayananController::class, 'show']);
    Route::get('/layanans/{layanan}/queues', [LayananController::class, 'queues']);

    // TTS — public for TV display announcer
    Route::get('/tts/queue/{queue}', [TtsController::class, 'queue']);

    // Printer Profiles — public default for kiosk
    Route::get('/printer-profiles/default', [PrinterProfilesController::class, 'defaultProfile']);
});

// Protected routes (requires Sanctum authentication)
Route::prefix('v1')->middleware('auth:sanctum')->group(function () {
    // Auth
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::post('/auth/refresh', [AuthController::class, 'refreshToken']);
    Route::post('/auth/stop-impersonation', [AuthController::class, 'stopImpersonation']);

    // Queues
    Route::get('/queues', [QueuesController::class, 'index']);
    Route::get('/queues/{queue}', [QueuesController::class, 'show']);
    Route::post('/queues/{queue}/call', [QueuesController::class, 'call']);
    Route::post('/queues/{queue}/recall', [QueuesController::class, 'recall']);
    Route::post('/queues/{queue}/complete', [QueuesController::class, 'complete']);
    Route::post('/queues/{queue}/skip', [QueuesController::class, 'skip']);

    // Call next for counter
    Route::post('/counters/{counterId}/call-next', [QueuesController::class, 'callNext']);

    // Videos — detail requires authentication; listing is public above
    Route::get('/videos/{video}', [VideosController::class, 'show']);

    // Admin/super management routes. Loket users must never reach these APIs.
    Route::middleware('role:admin,super')->group(function () {
        // Impersonate — admin can preview as loket
        Route::post('/auth/impersonate/{userId}', [AuthController::class, 'impersonate']);
        // Counters
        Route::get('/counters', [CountersController::class, 'index']);
        Route::post('/counters', [CountersController::class, 'store']);
        Route::get('/counters/{counter}', [CountersController::class, 'show']);
        Route::put('/counters/{counter}', [CountersController::class, 'update']);
        Route::delete('/counters/{counter}', [CountersController::class, 'destroy']);
        Route::post('/counters/{counter}/assign-user', [CountersController::class, 'assignUser']);
        Route::post('/counters/{counter}/unassign-user', [CountersController::class, 'unassignUser']);
        Route::post('/counters/{counter}/sync-users', [CountersController::class, 'syncUsers']);

        // Users
        Route::get('/users', [UsersController::class, 'index']);
        Route::post('/users', [UsersController::class, 'store']);
        Route::get('/users/{user}', [UsersController::class, 'show']);
        Route::put('/users/{user}', [UsersController::class, 'update']);
        Route::delete('/users/{user}', [UsersController::class, 'destroy']);

        // Displays — writes only; index/show/sync are public above
        Route::post('/displays', [DisplaysController::class, 'store']);
        Route::put('/displays/{display}', [DisplaysController::class, 'update']);
        Route::delete('/displays/{display}', [DisplaysController::class, 'destroy']);
        Route::post('/displays/{display}/volume', [DisplaysController::class, 'updateVolume']);
        Route::post('/displays/{display}/announcer', [DisplaysController::class, 'updateAnnouncer']);

        // Videos — writes only; index is public above
        Route::post('/videos', [VideosController::class, 'store']);
        Route::put('/videos/{video}', [VideosController::class, 'update']);
        Route::delete('/videos/{video}', [VideosController::class, 'destroy']);
        Route::post('/videos/reorder', [VideosController::class, 'reorder']);

        // Printer Profiles
        Route::get('/printer-profiles', [PrinterProfilesController::class, 'index']);
        Route::get('/printer-profiles/{printerProfile}', [PrinterProfilesController::class, 'show']);
        Route::post('/printer-profiles', [PrinterProfilesController::class, 'store']);
        Route::put('/printer-profiles/{printerProfile}', [PrinterProfilesController::class, 'update']);
        Route::delete('/printer-profiles/{printerProfile}', [PrinterProfilesController::class, 'destroy']);

        // Kiosk Stations
        Route::get('/kiosk-stations', [KioskStationsController::class, 'index']);
        Route::post('/kiosk-stations', [KioskStationsController::class, 'store']);
        Route::get('/kiosk-stations/{kioskStation}', [KioskStationsController::class, 'show']);
        Route::put('/kiosk-stations/{kioskStation}', [KioskStationsController::class, 'update']);
        Route::delete('/kiosk-stations/{kioskStation}', [KioskStationsController::class, 'destroy']);
        Route::post('/kiosk-stations/{kioskStation}/regenerate-token', [KioskStationsController::class, 'regenerateToken']);
        Route::post('/kiosk-stations/{kioskStation}/heartbeat', [KioskStationsController::class, 'heartbeat']);

        // Layanan — list/show/queues remain public above
        Route::post('/layanans', [LayananController::class, 'store']);
        Route::put('/layanans/{layanan}', [LayananController::class, 'update']);
        Route::delete('/layanans/{layanan}', [LayananController::class, 'destroy']);

        // Audit Logs
        Route::get('/audit-logs/export', [AuditLogsController::class, 'export']);
        Route::get('/audit-logs', [AuditLogsController::class, 'index']);
        Route::get('/audit-logs/{auditLog}', [AuditLogsController::class, 'show']);
    });

});