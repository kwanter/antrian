<?php

namespace Database\Factories;

use App\Models\Layanan;
use Illuminate\Database\Eloquent\Factories\Factory;

class LayananFactory extends Factory
{
    protected $model = Layanan::class;

    public function definition(): array
    {
        return [
            'name' => $this->faker->randomElement(['Customer Service', 'Teller', 'Kasir', 'CS', 'Admin']),
            'code' => strtoupper($this->faker->unique()->lexify('???')),
            'description' => $this->faker->sentence(),
            'is_active' => true,
            'counter_id' => null,
        ];
    }

    public function inactive(): static
    {
        return $this->state(fn (array $attributes) => ['is_active' => false]);
    }
}