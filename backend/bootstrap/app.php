<?php

use App\Http\Middleware\AssignCounter;
use App\Http\Middleware\CheckRole;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Routing\Middleware\SubstituteBindings;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\View\Middleware\ShareErrorsFromSession;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        channels: __DIR__.'/../routes/channels.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'role' => CheckRole::class,
            'counter.assign' => AssignCounter::class,
            'auth' => \App\Http\Middleware\Authenticate::class,
        ]);

        // Stateful API middleware for SPA cookie-based auth (Sanctum).
        //
        // EncryptCookies / StartSession / ShareErrorsFromSession /
        // SubstituteBindings stay because several API controllers call
        // $request->session() unconditionally (login, impersonation, queue
        // call). Adding ValidateCsrfToken enforces the CSRF token on every
        // session-cookie state-changing request, closing F-04 / T2-F1.
        //
        // AuthenticateSession is deliberately omitted: it calls
        // `viaRemember()` on the auth guard, which is incompatible with
        // Sanctum's RequestGuard and would break every authenticated
        // request. CSRF enforcement does not require it.
        //
        // Bearer-token API requests (no session cookie) are not subject to
        // CSRF — ValidateCsrfToken only acts when a session cookie is present.
        $middleware->api(prepend: [
            EncryptCookies::class,
            ShareErrorsFromSession::class,
            StartSession::class,
            SubstituteBindings::class,
            ValidateCsrfToken::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(function ($request, \Throwable $e) {
            return $request->is('api/*') || $request->expectsJson();
        });

        // Public kiosk ticket intake has no authenticated session to protect,
        // so CSRF enforcement is meaningless here and would force every
        // unauthenticated kiosk to fetch a cookie first. Abuse is handled by
        // rate limiting (F-25), not CSRF. Exempt only this one public path.
        \Illuminate\Foundation\Http\Middleware\ValidateCsrfToken::except([
            'api/v1/queues',
        ]);
    })->create();