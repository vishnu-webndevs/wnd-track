<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('screenshots', function (Blueprint $table) {
            $table->foreignId('time_log_id')->nullable()->after('project_id')->constrained('time_logs')->onDelete('cascade');
        });
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->foreignId('time_log_id')->nullable()->after('project_id')->constrained('time_logs')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::table('screenshots', function (Blueprint $table) {
            $table->dropConstrainedForeignId('time_log_id');
        });
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->dropConstrainedForeignId('time_log_id');
        });
    }
};
