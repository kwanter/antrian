<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\KioskStation>
 */
class KioskStationFactory extends Factory
{
    public function definition(): array
    {
        return [
            'name' => $this->faker->unique()->words(2, true) . ' Kiosk',
            'status' => 'offline',
            'last_heartbeat' => null,
            'printer_profile_id' => null,
        ];
    }
}
