<?php

namespace Database\Seeders;

use App\Models\Counter;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        // Create admin user
        User::create([
            'name' => 'Admin',
            'email' => 'admin@antrian.local',
            'password' => Hash::make('password123'),
            'role' => 'admin',
            'is_active' => true,
        ]);

        // Create counter 1 (Loket 1)
        $counter1 = Counter::create([
            'name' => 'Loket 1',
            'code' => 'L1',
            'status' => 'active',
        ]);

        // Create counter 2 (Loket 2)
        $counter2 = Counter::create([
            'name' => 'Loket 2',
            'code' => 'L2',
            'status' => 'active',
        ]);

        // Create loket users
        $user1 = User::create([
            'name' => 'Petugas Loket 1',
            'email' => 'loket1@antrian.local',
            'password' => Hash::make('password123'),
            'role' => 'loket',
            'is_active' => true,
            'counter_id' => $counter1->id,
        ]);

        $user2 = User::create([
            'name' => 'Petugas Loket 2',
            'email' => 'loket2@antrian.local',
            'password' => Hash::make('password123'),
            'role' => 'loket',
            'is_active' => true,
            'counter_id' => $counter2->id,
        ]);

        // Assign users to counters via pivot
        $counter1->users()->attach($user1->id);
        $counter2->users()->attach($user2->id);
    }
}