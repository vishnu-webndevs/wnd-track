<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Fix for MySQL implicitly adding ON UPDATE CURRENT_TIMESTAMP to the first timestamp column
        // We want start_time to default to NOW() on create, but NOT update on every row update.
        DB::statement('ALTER TABLE time_logs MODIFY start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // DB::statement('ALTER TABLE time_logs MODIFY start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
    }
};
