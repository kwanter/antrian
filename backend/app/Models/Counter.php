<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Counter extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'code', 'status'];

    protected function casts(): array
    {
        return [
            'status' => 'string',
        ];
    }

    // Relationships
    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'counter_user')
            ->withPivot('assigned_at');
    }

    public function assignedUsers(): BelongsToMany
    {
        return $this->users();
    }

    public function queues(): HasMany
    {
        return $this->hasMany(Queue::class);
    }

    // Helpers
    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    public function isInactive(): bool
    {
        return $this->status === 'inactive';
    }
}