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
        Schema::create('user_presence', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->enum('status', ['available', 'working', 'paused', 'offline'])->default('offline');
            $table->unsignedBigInteger('current_project_id')->nullable();
            $table->unsignedBigInteger('current_task_id')->nullable();
            $table->timestamp('tracking_started_at')->nullable();
            $table->timestamp('last_activity_at')->nullable();
            $table->boolean('internet_connected')->default(true);
            $table->timestamp('last_seen')->nullable();
            $table->timestamps();

            $table->foreign('current_project_id')->references('id')->on('projects')->nullOnDelete();
            $table->foreign('current_task_id')->references('id')->on('tasks')->nullOnDelete();
            $table->unique('user_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('user_presence');
    }
};
