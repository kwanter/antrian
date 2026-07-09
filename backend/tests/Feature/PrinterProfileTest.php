<?php

namespace Tests\Feature;

use App\Models\KioskStation;
use App\Models\PrinterProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PrinterProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_default_printer_profile_prefers_58mm(): void
    {
        PrinterProfile::factory()->create(['paper_size' => '80mm']);
        $profile = PrinterProfile::factory()->create(['paper_size' => '58mm']);

        $response = $this->getJson('/api/v1/printer-profiles/default');

        $response->assertStatus(200)
            ->assertJsonPath('data.id', $profile->id)
            ->assertJsonPath('data.paper_size', '58mm');
    }

    public function test_admin_can_create_printer_profile_with_iware_config(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $response = $this->actingAs($admin)
            ->postJson('/api/v1/printer-profiles', [
                'name' => 'Iware C-58BT',
                'template' => [
                    'header_text' => 'ANTRIAN',
                    'footer_text' => 'Terima kasih',
                    'paper_size' => '58mm',
                    'copy_count' => 1,
                    'printer_model' => 'Iware C-58BT',
                    'connection_type' => 'web_serial',
                    'baud_rate' => 9600,
                    'charset' => 'utf-8',
                    'cut_mode' => 'partial',
                ],
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.name', 'Iware C-58BT')
            ->assertJsonPath('data.paper_size', '58mm')
            ->assertJsonPath('data.copy_count', 1)
            ->assertJsonPath('data.template.printer_model', 'Iware C-58BT')
            ->assertJsonPath('data.template.connection_type', 'web_serial')
            ->assertJsonPath('data.template.baud_rate', 9600)
            ->assertJsonPath('data.template.cut_mode', 'partial');

        $this->assertDatabaseHas('printer_profiles', [
            'name' => 'Iware C-58BT',
            'paper_size' => '58mm',
            'copy_count' => 1,
        ]);
    }

    public function test_admin_can_update_printer_config(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $profile = PrinterProfile::factory()->create([
            'name' => 'Old Name',
            'paper_size' => '58mm',
            'copy_count' => 1,
        ]);

        $response = $this->actingAs($admin)
            ->putJson("/api/v1/printer-profiles/{$profile->id}", [
                'name' => 'Iware C-58BT Updated',
                'template' => [
                    'header_text' => 'ANTRIAN PN',
                    'footer_text' => 'Silakan menunggu',
                    'paper_size' => '80mm',
                    'copy_count' => 2,
                    'printer_model' => 'Iware C-58BT',
                    'connection_type' => 'web_serial',
                    'baud_rate' => 19200,
                    'cut_mode' => 'full',
                ],
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.name', 'Iware C-58BT Updated')
            ->assertJsonPath('data.paper_size', '80mm')
            ->assertJsonPath('data.copy_count', 2)
            ->assertJsonPath('data.template.baud_rate', 19200)
            ->assertJsonPath('data.template.cut_mode', 'full');
    }

    public function test_cannot_delete_profile_assigned_to_kiosk(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $profile = PrinterProfile::factory()->create();
        KioskStation::create([
            'name' => 'Kiosk Utama',
            'status' => 'online',
            'printer_profile_id' => $profile->id,
        ]);

        $response = $this->actingAs($admin)
            ->deleteJson("/api/v1/printer-profiles/{$profile->id}");

        $response->assertStatus(400)
            ->assertJsonPath('message', 'Cannot delete profile that is assigned to kiosk stations');

        $this->assertDatabaseHas('printer_profiles', ['id' => $profile->id]);
    }

    public function test_loket_cannot_create_printer_profile(): void
    {
        $loket = User::factory()->create(['role' => 'loket']);

        $response = $this->actingAs($loket)
            ->postJson('/api/v1/printer-profiles', [
                'name' => 'Iware C-58BT',
                'template' => [
                    'paper_size' => '58mm',
                    'copy_count' => 1,
                ],
            ]);

        $response->assertStatus(403);
    }

    public function test_admin_can_delete_unassigned_profile(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $profile = PrinterProfile::factory()->create();

        $response = $this->actingAs($admin)
            ->deleteJson("/api/v1/printer-profiles/{$profile->id}");

        $response->assertStatus(200)
            ->assertJsonPath('message', 'Printer profile deleted successfully');

        $this->assertDatabaseMissing('printer_profiles', ['id' => $profile->id]);
    }

    public function test_template_normalization_mirrors_to_top_level(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $response = $this->actingAs($admin)
            ->postJson('/api/v1/printer-profiles', [
                'name' => 'Test Profile',
                'template' => [
                    'paper_size' => '80mm',
                    'copy_count' => 3,
                    'header_text' => 'Header',
                    'footer_text' => 'Footer',
                ],
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.paper_size', '80mm')
            ->assertJsonPath('data.copy_count', 3)
            ->assertJsonPath('data.header_text', 'Header')
            ->assertJsonPath('data.footer_text', 'Footer');
    }
}
