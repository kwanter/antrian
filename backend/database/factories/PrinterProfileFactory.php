<?php

namespace Database\Factories;

use App\Models\PrinterProfile;
use Illuminate\Database\Eloquent\Factories\Factory;

class PrinterProfileFactory extends Factory
{
    protected $model = PrinterProfile::class;

    public function definition(): array
    {
        return [
            'name' => fake()->words(2, true),
            'paper_size' => fake()->randomElement(['58mm', '80mm']),
            'copy_count' => fake()->numberBetween(1, 3),
            'header_text' => fake()->sentence(3),
            'footer_text' => fake()->sentence(3),
            'logo_url' => null,
            'template' => [
                'paper_size' => '58mm',
                'copy_count' => 1,
                'header_text' => 'Header',
                'footer_text' => 'Footer',
                'printer_model' => 'Generic',
                'connection_type' => 'web_serial',
                'baud_rate' => 9600,
                'charset' => 'utf-8',
                'cut_mode' => 'partial',
            ],
        ];
    }
}
