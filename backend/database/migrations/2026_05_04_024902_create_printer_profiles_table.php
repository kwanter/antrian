<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('printer_profiles', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->enum('paper_size', ['58mm', '80mm'])->default('58mm');
            $table->integer('copy_count')->default(1);
            $table->text('header_text')->nullable();
            $table->text('footer_text')->nullable();
            $table->string('logo_url')->nullable();
            $table->json('template')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('printer_profiles');
    }
};