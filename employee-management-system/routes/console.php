<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('report:daily-time')->dailyAt('21:00');
Schedule::command('timelogs:stop-ghosts')->everyMinute();
Schedule::command('timelogs:monitor-offline')->everyMinute();
Schedule::command('timelogs:monitor-activity')->everyFiveMinutes();
Schedule::command('meetings:remind')->everyMinute();


// Send monthly report on the last day of the month at 9:00 PM
Schedule::command('app:send-timesheet-reports --period=month')->monthlyOn(date('t'), '21:00');
