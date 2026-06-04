<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->string('type');           // tracking_started, meeting_created, chat_message, etc.
            $table->string('category');       // tracking, user, network, work, meeting, communication
            $table->string('title');
            $table->text('message');
            $table->json('data')->nullable(); // Extra payload (project_id, user_id, etc.)
            $table->unsignedBigInteger('sender_id')->nullable();
            $table->string('icon')->nullable();
            $table->timestamps();

            $table->foreign('sender_id')->references('id')->on('users')->nullOnDelete();
            $table->index(['type', 'created_at']);
            $table->index('category');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};
