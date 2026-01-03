<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Client;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class ProjectController extends Controller
{
    public function __construct()
    {
        $this->middleware('auth:sanctum');
    }

    public function index(Request $request)
    {
        $projects = Project::query()
            ->when($request->search, function ($query, $search) {
                $query->where('name', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%");
            })
            ->when($request->status, function ($query, $status) {
                $query->where('status', $status);
            })
            ->when($request->client_id, function ($query, $client_id) {
                $query->where('client_id', $client_id);
            })
            ->when($request->manager_id, function ($query, $manager_id) {
                $query->where('manager_id', $manager_id);
            })
            ->with(['client', 'manager'])
            ->withCount('tasks')
            ->orderBy('created_at', 'desc')
            ->paginate(10);

        return response()->json($projects);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'client_id' => 'required|exists:clients,id',
            'manager_id' => 'nullable|exists:users,id',
            'status' => 'in:planning,in_progress,completed,on_hold,cancelled',
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'budget' => 'nullable|numeric|min:0',
            'priority' => 'in:low,medium,high,urgent',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $project = Project::create([
            'name' => $request->name,
            'description' => $request->description,
            'client_id' => $request->client_id,
            'manager_id' => $request->manager_id,
            'status' => $request->status ?? 'planning',
            'start_date' => $request->start_date,
            'end_date' => $request->end_date,
            'budget' => $request->budget,
            'priority' => $request->priority ?? 'medium',
            'notes' => $request->notes,
        ]);

        return response()->json([
            'message' => 'Project created successfully',
            'project' => $project->load(['client', 'manager'])
        ], 201);
    }

    public function show(Project $project)
    {
        return response()->json([
            'project' => $project->load(['client', 'manager', 'tasks.assignedTo'])
        ]);
    }

    public function update(Request $request, Project $project)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'client_id' => 'sometimes|exists:clients,id',
            'manager_id' => 'nullable|exists:users,id',
            'status' => 'sometimes|in:planning,in_progress,completed,on_hold,cancelled',
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'budget' => 'nullable|numeric|min:0',
            'priority' => 'sometimes|in:low,medium,high,urgent',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $project->update($request->only([
            'name', 'description', 'client_id', 'manager_id', 'status', 
            'start_date', 'end_date', 'budget', 'priority', 'notes'
        ]));

        return response()->json([
            'message' => 'Project updated successfully',
            'project' => $project->load(['client', 'manager'])
        ]);
    }

    public function destroy(Project $project)
    {
        if ($project->tasks()->exists()) {
            return response()->json([
                'message' => 'Cannot delete project with existing tasks'
            ], 422);
        }

        $project->delete();

        return response()->json([
            'message' => 'Project deleted successfully'
        ]);
    }

    public function getActiveProjects()
    {
        $projects = Project::where('status', 'in_progress')
            ->orWhere('status', 'planning')
            ->with(['client', 'manager'])
            ->orderBy('name')
            ->get();

        return response()->json($projects);
    }

    public function getProjectsByClient(Client $client)
    {
        $projects = $client->projects()
            ->with(['manager'])
            ->withCount('tasks')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($projects);
    }

    public function getProjectsByManager(User $user)
    {
        $projects = $user->projects()
            ->with(['client'])
            ->withCount('tasks')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($projects);
    }
}
