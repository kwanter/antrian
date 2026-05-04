<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Queue extends Model
{
    use HasFactory;

    protected $fillable = [
        'ticket_number',
        'service_type',
        'customer_name',
        'customer_phone',
        'status',
        'counter_id',
        'called_by',
        'called_at',
        'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'called_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    // Relationships
    public function counter(): BelongsTo
    {
        return $this->belongsTo(Counter::class);
    }

    public function calledByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'called_by');
    }

    public function logs(): HasMany
    {
        return $this->hasMany(QueueLog::class);
    }

    // Status helpers
    public function isWaiting(): bool
    {
        return $this->status === 'waiting';
    }

    public function isCalled(): bool
    {
        return $this->status === 'called';
    }

    public function isServing(): bool
    {
        return $this->status === 'serving';
    }

    public function isCompleted(): bool
    {
        return $this->status === 'completed';
    }

    public function isSkipped(): bool
    {
        return $this->status === 'skipped';
    }

    // Actions
    public function call(string $calledBy, ?int $counterId = null): void
    {
        $this->update([
            'status' => 'called',
            'called_by' => $calledBy,
            'counter_id' => $counterId ?? $this->counter_id,
            'called_at' => now(),
        ]);
    }

    public function complete(): void
    {
        $this->update([
            'status' => 'completed',
            'completed_at' => now(),
        ]);
    }

    public function skip(): void
    {
        $this->update([
            'status' => 'skipped',
        ]);
    }
}