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
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->integer('keyboard_count')->default(0)->after('duration');
            $table->integer('mouse_click_count')->default(0)->after('keyboard_count');
            $table->integer('mouse_scroll_count')->default(0)->after('mouse_click_count');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->dropColumn(['keyboard_count', 'mouse_click_count', 'mouse_scroll_count']);
        });
    }
};
