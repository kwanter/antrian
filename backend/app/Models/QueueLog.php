<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QueueLog extends Model
{
    use HasFactory;

    protected $fillable = ['queue_id', 'action', 'performed_by', 'metadata'];

    protected function casts(): array
    {
        return [
            'metadata' => 'array',
        ];
    }

    // Relationships
    public function queue(): BelongsTo
    {
        return $this->belongsTo(Queue::class);
    }
}