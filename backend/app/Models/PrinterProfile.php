<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PrinterProfile extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'paper_size',
        'copy_count',
        'header_text',
        'footer_text',
        'logo_url',
        'template',
    ];

    protected function casts(): array
    {
        return [
            'copy_count' => 'integer',
            'template' => 'array',
        ];
    }

    // Relationships
    public function kioskStations(): HasMany
    {
        return $this->hasMany(KioskStation::class, 'printer_profile_id');
    }

    // Helpers
    public function is58mm(): bool
    {
        return $this->paper_size === '58mm';
    }

    public function is80mm(): bool
    {
        return $this->paper_size === '80mm';
    }

    public function getWidth(): int
    {
        return $this->is58mm() ? 384 : 576; // dots
    }
}