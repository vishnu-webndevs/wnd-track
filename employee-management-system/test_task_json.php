<?php

use App\Models\Task;
use Illuminate\Support\Facades\Auth;

require __DIR__ . '/vendor/autoload.php';

$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);
$kernel->handle(
    $request = Illuminate\Http\Request::capture()
);

// Find a task that has an assigned user
$task = Task::whereNotNull('assigned_to')->with(['project', 'assignedTo', 'createdBy'])->first();

if ($task) {
    echo "Task Found ID: " . $task->id . "\n";
    echo "Assigned To ID (Attribute): " . $task->assigned_to . "\n";
    echo "Assigned To Object (Relation): " . ($task->assignedTo ? 'Present' : 'Missing') . "\n";
    
    echo "\nJSON Output:\n";
    echo json_encode($task->load(['project', 'assignedTo', 'createdBy']), JSON_PRETTY_PRINT);
} else {
    echo "No task with assigned_to found.\n";
}
