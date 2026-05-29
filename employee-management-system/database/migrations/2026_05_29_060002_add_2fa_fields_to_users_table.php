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
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('two_factor_enabled')->default(false)->after('send_worklog_telegram');
            $table->string('two_factor_method')->default('email')->after('two_factor_enabled'); // 'email', 'totp', 'both'
            $table->string('two_factor_secret')->nullable()->after('two_factor_method');
            $table->text('two_factor_backup_codes')->nullable()->after('two_factor_secret');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['two_factor_enabled', 'two_factor_method', 'two_factor_secret', 'two_factor_backup_codes']);
        });
    }
};
