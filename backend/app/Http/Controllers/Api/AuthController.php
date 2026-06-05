<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        // Rate limit: 5 attempts per 60 seconds per email+IP
        $throttleKey = 'login:' . Str::lower($request->email) . '|' . $request->ip();

        if (RateLimiter::tooManyAttempts($throttleKey, 5)) {
            $seconds = RateLimiter::availableIn($throttleKey);
            return response()->json([
                'message' => 'Terlalu banyak percobaan login. Coba lagi dalam ' . $seconds . ' detik.',
                'code' => 'TOO_MANY_ATTEMPTS',
            ], 429);
        }

        $user = \App\Models\User::where('email', $request->email)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            RateLimiter::hit($throttleKey, 60);
            return response()->json([
                'message' => 'Email atau password salah.',
                'code' => 'INVALID_CREDENTIALS',
            ], 401);
        }

        if (!$user->is_active) {
            return response()->json([
                'message' => 'Akun Anda tidak aktif. Hubungi admin.',
                'code' => 'ACCOUNT_INACTIVE',
            ], 403);
        }

        // Check counter assignment for loket users
        if ($user->isLoket() && !$user->counter_id && $user->assignedCounters()->count() === 0) {
            return response()->json([
                'message' => 'Akun loket belum ditugaskan ke loket manapun. Hubungi admin.',
                'code' => 'COUNTER_NOT_ASSIGNED',
            ], 403);
        }

        RateLimiter::clear($throttleKey);

        Auth::login($user);
        $request->session()->regenerate();

        // Audit log
        AuditLog::log(
            action: 'login',
            model: 'User',
            modelId: $user->id,
            changes: null,
            ipAddress: $request->ip(),
            userId: $user->id
        );

        return response()->json([
            'data' => [
                'user' => $user->load('counter.layanan', 'assignedCounters'),
            ],
            'message' => 'Login successful',
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $user = $request->user();

        // Audit log
        AuditLog::log(
            action: 'logout',
            model: 'User',
            modelId: $user->id,
            changes: null,
            ipAddress: $request->ip(),
            userId: $user->id
        );

        // Logout from web session (Sanctum session cookie auth)
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json([
            'message' => 'Logout successful',
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $request->user()->load('counter.layanan', 'assignedCounters'),
        ]);
    }

    public function refreshToken(Request $request): JsonResponse
    {
        $user = $request->user();

        // Regenerate session to rotate session ID
        $request->session()->regenerate();

        return response()->json([
            'data' => [
                'user' => $user->load('counter.layanan', 'assignedCounters'),
            ],
            'message' => 'Session refreshed',
        ]);
    }
}