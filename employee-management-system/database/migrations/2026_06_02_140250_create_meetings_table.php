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
        Schema::create('meetings', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->text('description')->nullable();
            $table->enum('type', ['team', 'one_on_one', 'department'])->default('team');
            $table->enum('status', ['scheduled', 'live', 'completed', 'cancelled'])->default('scheduled');
            $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
            $table->timestamp('scheduled_at');
            $table->integer('duration_minutes')->default(30);
            $table->timestamp('started_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->string('meeting_link')->nullable();   // For Phase 6 internal meetings
            $table->timestamps();

            $table->index(['status', 'scheduled_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('meetings');
    }
};
