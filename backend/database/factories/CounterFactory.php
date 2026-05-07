<?php

namespace Database\Factories;

use App\Models\Counter;
use Illuminate\Database\Eloquent\Factories\Factory;

class CounterFactory extends Factory
{
    protected $model = Counter::class;

    public function definition(): array
    {
        $name = $this->faker->randomElement(['Counter 1', 'Counter 2', 'Counter 3', 'CS 1', 'Teller 1']);
        $code = strtoupper($this->faker->unique()->regexify('[A-Z]{3}[0-9]{2}'));

        return [
            'name' => $name,
            'code' => $code,
            'status' => 'active',
        ];
    }

    public function inactive(): static
    {
        return $this->state(fn (array $attributes) => ['status' => 'inactive']);
    }
}