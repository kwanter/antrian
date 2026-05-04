<?php

namespace Database\Seeders;

use App\Models\Display;
use App\Models\PrinterProfile;
use Illuminate\Database\Seeder;

class DisplaySeeder extends Seeder
{
    public function run(): void
    {
        // Create default display
        $display = Display::create([
            'name' => 'Display Utama',
            'location' => 'Ruang Tunggu',
            'is_active' => true,
            'settings' => [
                'counter_id' => null,
                'idle_timeout' => 300,
            ],
        ]);

        // Create default printer profile
        PrinterProfile::create([
            'name' => 'Default 58mm',
            'paper_size' => '58mm',
            'copy_count' => 1,
            'header_text' => 'Sistem Antrian Digital',
            'footer_text' => 'Terima kasih atas kunjungannya',
        ]);
    }
}