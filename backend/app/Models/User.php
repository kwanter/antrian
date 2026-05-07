<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    #[Fillable(['name', 'email', 'password', 'role', 'is_active', 'counter_id'])]
    // counter_id: user's current active counter (for session context)
    // Authorized counters are tracked via counter_user pivot (see assignedCounters())
    protected $fillable = ['name', 'email', 'password', 'role', 'is_active', 'counter_id'];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
        ];
    }

    // Relationships
    public function counter(): BelongsTo
    {
        return $this->belongsTo(Counter::class);
    }

    public function assignedCounters(): BelongsToMany
    {
        return $this->belongsToMany(Counter::class, 'counter_user')
            ->withPivot('assigned_at');
    }

    public function queues(): HasMany
    {
        return $this->hasMany(Queue::class, 'called_by', 'name');
    }

    public function auditLogs(): HasMany
    {
        return $this->hasMany(AuditLog::class);
    }

    // Role helpers
    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }

    public function isLoket(): bool
    {
        return $this->role === 'loket';
    }

    public function isSuper(): bool
    {
        return $this->role === 'super';
    }

    public function hasRole(string $role): bool
    {
        return $this->role === $role;
    }
}