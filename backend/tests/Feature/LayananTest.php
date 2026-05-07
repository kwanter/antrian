<?php

namespace Tests\Feature;

use App\Models\Layanan;
use App\Models\Counter;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LayananTest extends TestCase
{
    use RefreshDatabase;

    public function test_can_list_active_layanan_publicly(): void
    {
        Layanan::factory()->create(['name' => 'Customer Service', 'code' => 'CS', 'is_active' => true]);
        Layanan::factory()->create(['name' => 'Teller', 'code' => 'TEL', 'is_active' => false]);

        $response = $this->getJson('/api/v1/layanans');

        $response->assertStatus(200)
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.code', 'CS');
    }

    public function test_can_create_layanan_as_admin(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $counter = Counter::factory()->create();

        $response = $this->actingAs($admin)
            ->postJson('/api/v1/layanans', [
                'name' => 'Customer Service',
                'code' => 'CS',
                'counter_id' => $counter->id,
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.code', 'CS')
            ->assertJsonPath('data.counter_id', $counter->id);

        $this->assertDatabaseHas('layanans', [
            'code' => 'CS',
            'counter_id' => $counter->id,
        ]);
    }

    public function test_prevents_duplicate_counter_assignment(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $counter = Counter::factory()->create();
        Layanan::factory()->create(['counter_id' => $counter->id]);

        $response = $this->actingAs($admin)
            ->postJson('/api/v1/layanans', [
                'name' => 'Another Service',
                'code' => 'ANOTHER',
                'counter_id' => $counter->id,
            ]);

        $response->assertStatus(422);
    }
}
