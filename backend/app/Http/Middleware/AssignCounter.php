<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AssignCounter
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        // Admins and super users can bypass
        if ($user->isAdmin() || $user->isSuper()) {
            return $next($request);
        }

        // Loket users must have a counter assigned
        if ($user->isLoket()) {
            if (!$user->counter_id && $user->assignedCounters()->count() === 0) {
                return response()->json([
                    'message' => 'Forbidden: You are not assigned to any counter'
                ], 403);
            }
        }

        return $next($request);
    }
}