<?php

namespace Tests\Feature;

use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Router;
use Tests\TestCase;

/**
 * Guards that the API stack runs ValidateCsrfToken on session-cookie
 * mutating routes. F-04 / T2-F1 found the API middleware stack had no CSRF
 * validation at all. bootstrap/app.php now prepends ValidateCsrfToken to
 * the `api` middleware group alongside the session pipeline the
 * controllers already depend on.
 *
 * Live CSRF rejection requires a real session cookie exchange; this test
 * asserts the wiring so a future refactor that drops ValidateCsrfToken
 * from the API stack fails loudly.
 */
class CsrfCheckTest extends TestCase
{
    use RefreshDatabase;

    public function test_api_middleware_group_includes_csrf_validation(): void
    {
        $apiMiddleware = app(Router::class)->getMiddlewareGroups()['api'] ?? [];

        $this->assertContains(
            ValidateCsrfToken::class,
            $apiMiddleware,
            'The api middleware group must include ValidateCsrfToken. F-04 regression.'
        );
    }
}
