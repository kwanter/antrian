<?php

use App\Http\Controllers\Api\AuditLogsController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CountersController;
use App\Http\Controllers\Api\DisplaysController;
use App\Http\Controllers\Api\KioskStationsController;
use App\Http\Controllers\Api\PrinterProfilesController;
use App\Http\Controllers\Api\QueuesController;
use App\Http\Controllers\Api\UsersController;
use App\Http\Controllers\Api\VideosController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

// Public routes
Route::prefix('v1')->group(function () {
    // Auth
    Route::post('/auth/login', [AuthController::class, 'login']);
});

// Protected routes (requires Sanctum authentication)
Route::prefix('v1')->middleware('auth:sanctum')->group(function () {
    // Auth
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::post('/auth/refresh', [AuthController::class, 'refreshToken']);

    // Queues
    Route::get('/queues', [QueuesController::class, 'index']);
    Route::post('/queues', [QueuesController::class, 'store']);
    Route::get('/queues/stats', [QueuesController::class, 'stats']);
    Route::get('/queues/{queue}', [QueuesController::class, 'show']);
    Route::post('/queues/{queue}/call', [QueuesController::class, 'call']);
    Route::post('/queues/{queue}/complete', [QueuesController::class, 'complete']);
    Route::post('/queues/{queue}/skip', [QueuesController::class, 'skip']);

    // Call next for counter
    Route::post('/counters/{counterId}/call-next', [QueuesController::class, 'callNext']);

    // Counters
    Route::get('/counters', [CountersController::class, 'index']);
    Route::post('/counters', [CountersController::class, 'store']);
    Route::get('/counters/{counter}', [CountersController::class, 'show']);
    Route::put('/counters/{counter}', [CountersController::class, 'update']);
    Route::delete('/counters/{counter}', [CountersController::class, 'destroy']);
    Route::post('/counters/{counter}/assign-user', [CountersController::class, 'assignUser']);
    Route::post('/counters/{counter}/unassign-user', [CountersController::class, 'unassignUser']);

    // Users
    Route::get('/users', [UsersController::class, 'index']);
    Route::post('/users', [UsersController::class, 'store']);
    Route::get('/users/{user}', [UsersController::class, 'show']);
    Route::put('/users/{user}', [UsersController::class, 'update']);
    Route::delete('/users/{user}', [UsersController::class, 'destroy']);

    // Displays
    Route::get('/displays', [DisplaysController::class, 'index']);
    Route::post('/displays', [DisplaysController::class, 'store']);
    Route::get('/displays/{display}', [DisplaysController::class, 'show']);
    Route::put('/displays/{display}', [DisplaysController::class, 'update']);
    Route::delete('/displays/{display}', [DisplaysController::class, 'destroy']);
    Route::get('/displays/{display}/sync', [DisplaysController::class, 'sync']);
    Route::post('/displays/{display}/volume', [DisplaysController::class, 'updateVolume']);

    // Videos
    Route::get('/videos', [VideosController::class, 'index']);
    Route::post('/videos', [VideosController::class, 'store']);
    Route::get('/videos/{video}', [VideosController::class, 'show']);
    Route::put('/videos/{video}', [VideosController::class, 'update']);
    Route::delete('/videos/{video}', [VideosController::class, 'destroy']);
    Route::post('/videos/reorder', [VideosController::class, 'reorder']);

    // Printer Profiles
    Route::get('/printer-profiles', [PrinterProfilesController::class, 'index']);
    Route::post('/printer-profiles', [PrinterProfilesController::class, 'store']);
    Route::get('/printer-profiles/{printerProfile}', [PrinterProfilesController::class, 'show']);
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

    // Audit Logs (admin only)
    Route::get('/audit-logs', [AuditLogsController::class, 'index']);
    Route::get('/audit-logs/{auditLog}', [AuditLogsController::class, 'show']);
    Route::get('/audit-logs/export', [AuditLogsController::class, 'export']);
});