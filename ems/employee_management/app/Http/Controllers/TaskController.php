<?php

namespace App\Http\Controllers;

use App\Models\Task;
use App\Models\Project;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;

class TaskController extends Controller
{
    public function __construct()
    {
        $this->middleware('auth:sanctum');
    }

    public function index(Request $request)
    {
        $tasks = Task::query()
            ->when($request->search, function ($query, $search) {
                $query->where('title', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%");
            })
            ->when($request->status, function ($query, $status) {
                $query->where('status', $status);
            })
            ->when($request->priority, function ($query, $priority) {
                $query->where('priority', $priority);
            })
            ->when($request->project_id, function ($query, $project_id) {
                $query->where('project_id', $project_id);
            })
            ->when($request->assigned_to, function ($query, $assigned_to) {
                $query->where('assigned_to', $assigned_to);
            })
            ->when($request->created_by, function ($query, $created_by) {
                $query->where('created_by', $created_by);
            })
            ->with(['project', 'assignedTo', 'createdBy'])
            ->orderBy('sort_order', 'asc')
            ->orderBy('created_at', 'desc')
            ->paginate(10);

        return response()->json($tasks);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'project_id' => 'required|exists:projects,id',
            'assigned_to' => 'nullable|exists:users,id',
            'status' => 'in:pending,in_progress,completed,cancelled',
            'priority' => 'in:low,medium,high,urgent',
            'due_date' => 'nullable|date',
            'estimated_hours' => 'nullable|integer|min:0',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $nextOrder = Task::where('status', $request->status ?? 'pending')->max('sort_order');
        $nextOrder = is_null($nextOrder) ? 0 : $nextOrder + 1;

        $task = Task::create([
            'title' => $request->title,
            'description' => $request->description,
            'project_id' => $request->project_id,
            'assigned_to' => $request->assigned_to,
            'created_by' => auth()->id(),
            'status' => $request->status ?? 'pending',
            'sort_order' => $nextOrder,
            'priority' => $request->priority ?? 'medium',
            'due_date' => $request->due_date,
            'estimated_hours' => $request->estimated_hours,
            'notes' => $request->notes,
        ]);

        return response()->json([
            'message' => 'Task created successfully',
            'task' => $task->load(['project', 'assignedTo', 'createdBy'])
        ], 201);
    }

    public function show(Task $task)
    {
        return response()->json([
            'task' => $task->load(['project', 'assignedTo', 'createdBy', 'timeLogs'])
        ]);
    }

    public function update(Request $request, Task $task)
    {
        $validator = Validator::make($request->all(), [
            'title' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'project_id' => 'sometimes|exists:projects,id',
            'assigned_to' => 'nullable|exists:users,id',
            'status' => 'sometimes|in:pending,in_progress,completed,cancelled',
            'priority' => 'sometimes|in:low,medium,high,urgent',
            'due_date' => 'nullable|date',
            'estimated_hours' => 'nullable|integer|min:0',
            'actual_hours' => 'nullable|integer|min:0',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $data = $request->only([
            'title', 'description', 'project_id', 'assigned_to', 'status', 
            'priority', 'due_date', 'estimated_hours', 'actual_hours', 'notes'
        ]);

        // Update timestamps and sort order based on status changes
        if ($request->has('status')) {
            if ($request->status === 'in_progress' && $task->status !== 'in_progress') {
                $data['started_at'] = now();
            } elseif ($request->status === 'completed' && $task->status !== 'completed') {
                $data['completed_at'] = now();
            }
            if ($request->status !== $task->status) {
                $maxOrder = Task::where('status', $request->status)->max('sort_order');
                $data['sort_order'] = is_null($maxOrder) ? 0 : ($maxOrder + 1);
            }
        }

        $task->update($data);

        return response()->json([
            'message' => 'Task updated successfully',
            'task' => $task->load(['project', 'assignedTo', 'createdBy'])
        ]);
    }

    public function destroy(Task $task)
    {
        if ($task->timeLogs()->exists()) {
            return response()->json([
                'message' => 'Cannot delete task with existing time logs'
            ], 422);
        }

        $task->delete();

        return response()->json([
            'message' => 'Task deleted successfully'
        ]);
    }

    public function getTasksByProject(Project $project)
    {
        $tasks = $project->tasks()
            ->with(['assignedTo', 'createdBy'])
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($tasks);
    }

    public function getTasksByUser(User $user)
    {
        $tasks = $user->assignedTasks()
            ->with(['project', 'createdBy'])
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($tasks);
    }

    public function updateStatus(Request $request, Task $task)
    {
        $validator = Validator::make($request->all(), [
            'status' => 'required|in:pending,in_progress,completed,cancelled',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $data = ['status' => $request->status];

        if ($request->status === 'in_progress' && $task->status !== 'in_progress') {
            $data['started_at'] = now();
        } elseif ($request->status === 'completed' && $task->status !== 'completed') {
            $data['completed_at'] = now();
        }

        if ($request->status !== $task->status) {
            $maxOrder = Task::where('status', $request->status)->max('sort_order');
            $data['sort_order'] = is_null($maxOrder) ? 0 : ($maxOrder + 1);
        }

        $task->update($data);

        return response()->json([
            'message' => 'Task status updated successfully',
            'task' => $task->load(['project', 'assignedTo', 'createdBy'])
        ]);
    }

    public function reorder(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'status' => 'required|in:pending,in_progress,completed,cancelled',
            'ids' => 'required|array',
            'ids.*' => 'integer|exists:tasks,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        DB::transaction(function () use ($request) {
            $ids = $request->ids;
            foreach ($ids as $index => $id) {
                Task::where('id', $id)->update([
                    'status' => $request->status,
                    'sort_order' => $index,
                ]);
            }
        });

        return response()->json(['message' => 'Tasks reordered successfully']);
    }
}
