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
        $user = auth()->user();
        $tasks = Task::query()
            ->when($user->role !== 'admin', function ($query) use ($user) {
                $query->where(function ($q) use ($user) {
                    $q->where('assigned_to', $user->id)
                      ->orWhereHas('assignees', function ($sq) use ($user) {
                          $sq->where('users.id', $user->id);
                      });
                });
            })
            ->when($request->search, function ($query, $search) {
                $query->where('title', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%");
            })
            ->when($request->status, function ($query, $status) {
                $query->where('status', $status);
            }, function ($query) use ($request) {
                if (!$request->exclude_status) {
                    $query->where('status', '!=', 'completed');
                }
            })
            ->when($request->exclude_status, function ($query, $exclude_status) {
                $query->where('status', '!=', $exclude_status);
            })
            ->when($request->priority, function ($query, $priority) {
                $query->where('priority', $priority);
            })
            ->when($request->project_id, function ($query, $project_id) {
                $query->where('project_id', $project_id);
            })
            ->when($request->assigned_to, function ($query, $assigned_to) {
                $query->where(function ($q) use ($assigned_to) {
                    $q->where('assigned_to', $assigned_to)
                      ->orWhereHas('assignees', function ($sq) use ($assigned_to) {
                          $sq->where('users.id', $assigned_to);
                      });
                });
            })
            ->when($request->created_by, function ($query, $created_by) {
                $query->where('created_by', $created_by);
            })
            ->with(['project', 'assignedTo', 'createdBy', 'assignees'])
            ->orderBy('sort_order', 'asc')
            ->orderBy('created_at', 'desc')
            ->paginate($request->per_page ?? 10);

        return response()->json($tasks);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'project_id' => 'required|exists:projects,id',
            'assigned_to' => 'nullable|exists:users,id,status,active',
            'assignee_ids' => 'nullable|array',
            'assignee_ids.*' => 'exists:users,id,status,active',
            'status' => 'in:pending,in_progress,completed,cancelled',
            'priority' => 'in:low,medium,high,urgent',
            'due_date' => 'nullable|date',
            'estimated_hours' => 'nullable|integer|min:0',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $assigneeIds = $request->input('assignee_ids');
        if (is_null($assigneeIds) && $request->has('assigned_to') && $request->assigned_to) {
            $assigneeIds = [$request->assigned_to];
        }
        $assigneeIds = $assigneeIds ?? [];
        $assignedTo = !empty($assigneeIds) ? $assigneeIds[0] : null;

        $nextOrder = Task::where('status', $request->status ?? 'pending')->max('sort_order');
        $nextOrder = is_null($nextOrder) ? 0 : $nextOrder + 1;

        $task = Task::create([
            'title' => $request->title,
            'description' => $request->description,
            'project_id' => $request->project_id,
            'assigned_to' => $assignedTo,
            'created_by' => auth()->id(),
            'status' => $request->status ?? 'pending',
            'sort_order' => $nextOrder,
            'priority' => $request->priority ?? 'medium',
            'due_date' => $request->due_date,
            'estimated_hours' => $request->estimated_hours,
            'notes' => $request->notes,
        ]);

        if (!empty($assigneeIds)) {
            $task->assignees()->sync($assigneeIds);
            $project = Project::find($task->project_id);
            if ($project) {
                $project->employees()->syncWithoutDetaching($assigneeIds);
            }
            try {
                $notificationService = app(\App\Services\NotificationService::class);
                foreach ($assigneeIds as $userId) {
                    $notificationService->sendToUser(
                        $userId,
                        'task_assigned',
                        'work',
                        '📋 New Task Assigned',
                        "You have been assigned a new task: {$task->title}",
                        [
                            'task_id' => $task->id,
                            'task_title' => $task->title,
                            'project_id' => $task->project_id,
                        ],
                        auth()->id(),
                        '📋'
                    );
                }
            } catch (\Exception $e) {
                \Illuminate\Support\Facades\Log::warning('Failed to send task assignment notification: ' . $e->getMessage());
            }
        }

        return response()->json([
            'message' => 'Task created successfully',
            'task' => $task->load(['project', 'assignedTo', 'createdBy', 'assignees'])
        ], 201);
    }

    public function show(Task $task)
    {
        return response()->json([
            'task' => $task->load(['project', 'assignedTo', 'createdBy', 'timeLogs', 'assignees'])
        ]);
    }

    public function update(Request $request, Task $task)
    {
        $validator = Validator::make($request->all(), [
            'title' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'project_id' => 'sometimes|exists:projects,id',
            'assignee_ids' => 'nullable|array',
            'assignee_ids.*' => 'exists:users,id',
            'assigned_to' => [
                'nullable',
                \Illuminate\Validation\Rule::exists('users', 'id')->where(function ($query) use ($request, $task) {
                    if ($request->has('assigned_to') && $request->assigned_to == $task->assigned_to) {
                        return $query;
                    }
                    return $query->where('status', 'active');
                })
            ],
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
            'title', 'description', 'project_id', 'status', 
            'priority', 'due_date', 'estimated_hours', 'actual_hours', 'notes'
        ]);

        $assigneeIds = $request->input('assignee_ids');
        $hasAssigneeIds = $request->has('assignee_ids');

        if (!$hasAssigneeIds && $request->has('assigned_to')) {
            $assigneeIds = $request->assigned_to ? [$request->assigned_to] : [];
            $hasAssigneeIds = true;
        }

        if ($hasAssigneeIds) {
            $assigneeIds = $assigneeIds ?? [];
            $data['assigned_to'] = !empty($assigneeIds) ? $assigneeIds[0] : null;
        } else {
            if ($request->has('assigned_to')) {
                $data['assigned_to'] = $request->assigned_to;
            }
        }

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

        $oldAssignees = $task->assignees()->pluck('users.id')->toArray();
        if (empty($oldAssignees) && $task->assigned_to) {
            $oldAssignees = [$task->assigned_to];
        }

        $task->update($data);

        if ($hasAssigneeIds) {
            $task->assignees()->sync($assigneeIds);
            
            $projectId = $request->project_id ?? $task->project_id;
            $project = Project::find($projectId);
            if ($project && !empty($assigneeIds)) {
                $project->employees()->syncWithoutDetaching($assigneeIds);
            }

            // Identify new assignees
            $newAssigneeIds = array_diff($assigneeIds, $oldAssignees);
            if (!empty($newAssigneeIds)) {
                try {
                    $notificationService = app(\App\Services\NotificationService::class);
                    foreach ($newAssigneeIds as $userId) {
                        $notificationService->sendToUser(
                            $userId,
                            'task_assigned',
                            'work',
                            '📋 New Task Assigned',
                            "You have been assigned a new task: {$task->title}",
                            [
                                'task_id' => $task->id,
                                'task_title' => $task->title,
                                'project_id' => $task->project_id,
                            ],
                            auth()->id(),
                            '📋'
                        );
                    }
                } catch (\Exception $e) {
                    \Illuminate\Support\Facades\Log::warning('Failed to send task update assignment notification: ' . $e->getMessage());
                }
            }
        } else {
            // If assignee_ids wasn't passed but project changed or single assigned_to changed
            $projectId = $request->project_id ?? $task->project_id;
            if ($request->has('assigned_to') && $request->assigned_to) {
                $task->assignees()->sync([$request->assigned_to]);
                $project = Project::find($projectId);
                if ($project) {
                    $project->employees()->syncWithoutDetaching([$request->assigned_to]);
                }
                
                if ($request->assigned_to !== $task->assigned_to) {
                    try {
                        $notificationService = app(\App\Services\NotificationService::class);
                        $notificationService->sendToUser(
                            $request->assigned_to,
                            'task_assigned',
                            'work',
                            '📋 New Task Assigned',
                            "You have been assigned a new task: {$task->title}",
                            [
                                'task_id' => $task->id,
                                'task_title' => $task->title,
                                'project_id' => $task->project_id,
                            ],
                            auth()->id(),
                            '📋'
                        );
                    } catch (\Exception $e) {
                        \Illuminate\Support\Facades\Log::warning('Failed to send task update assignment notification: ' . $e->getMessage());
                    }
                }
            } elseif ($request->has('project_id') && $task->project_id != $projectId) {
                $currentAssignees = $task->assignees()->pluck('users.id')->toArray();
                if (empty($currentAssignees) && $task->assigned_to) {
                    $currentAssignees = [$task->assigned_to];
                }
                $project = Project::find($projectId);
                if ($project && !empty($currentAssignees)) {
                    $project->employees()->syncWithoutDetaching($currentAssignees);
                }
            }
        }

        return response()->json([
            'message' => 'Task updated successfully',
            'task' => $task->load(['project', 'assignedTo', 'createdBy', 'assignees'])
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
        $user = auth()->user();
        $tasks = $project->tasks()
            ->when($user->role !== 'admin', function ($query) use ($user) {
                $query->where(function ($q) use ($user) {
                    $q->where('assigned_to', $user->id)
                      ->orWhereHas('assignees', function ($sq) use ($user) {
                          $sq->where('users.id', $user->id);
                      });
                });
            })
            ->with(['assignedTo', 'createdBy', 'assignees'])
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($tasks);
    }

    public function getTasksByUser(User $user)
    {
        if (auth()->user()->role !== 'admin' && auth()->id() !== $user->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $tasks = $user->assignedTasks()
            ->with(['project', 'createdBy', 'assignees'])
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
            'task' => $task->load(['project', 'assignedTo', 'createdBy', 'assignees'])
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
