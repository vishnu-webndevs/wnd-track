<?php

namespace App\Http\Controllers;

use App\Models\Client;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class ClientController extends Controller
{
    public function __construct()
    {
        $this->middleware('auth:sanctum');
    }

    public function index(Request $request)
    {
        $user = auth()->user();
        $clients = Client::query()
            ->when($user->role !== 'admin', function ($query) use ($user) {
                $query->whereHas('projects', function ($pq) use ($user) {
                    $pq->where('manager_id', $user->id)
                       ->orWhereHas('tasks', function ($tq) use ($user) {
                           $tq->where('assigned_to', $user->id);
                       });
                });
            })
            ->when($request->search, function ($query, $search) {
                $query->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('company', 'like', "%{$search}%");
            })
            ->when($request->status, function ($query, $status) {
                $query->where('status', $status);
            })
            ->withCount('projects')
            ->orderBy('created_at', 'desc')
            ->paginate(10);

        return response()->json($clients);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:clients',
            'phone' => 'nullable|string|max:20',
            'address' => 'nullable|string',
            'company' => 'nullable|string|max:255',
            'website' => 'nullable|url|max:255',
            'status' => 'in:active,inactive',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $client = Client::create([
            'name' => $request->name,
            'email' => $request->email,
            'phone' => $request->phone,
            'address' => $request->address,
            'company' => $request->company,
            'website' => $request->website,
            'status' => $request->status ?? 'active',
            'notes' => $request->notes,
        ]);

        return response()->json([
            'message' => 'Client created successfully',
            'client' => $client
        ], 201);
    }

    public function show(Client $client)
    {
        return response()->json([
            'client' => $client->load(['projects'])
        ]);
    }

    public function update(Request $request, Client $client)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'sometimes|string|max:255',
            'email' => 'sometimes|string|email|max:255|unique:clients,email,' . $client->id,
            'phone' => 'nullable|string|max:20',
            'address' => 'nullable|string',
            'company' => 'nullable|string|max:255',
            'website' => 'nullable|url|max:255',
            'status' => 'sometimes|in:active,inactive',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $client->update($request->only(['name', 'email', 'phone', 'address', 'company', 'website', 'status', 'notes']));

        return response()->json([
            'message' => 'Client updated successfully',
            'client' => $client
        ]);
    }

    public function destroy(Client $client)
    {
        if ($client->projects()->exists()) {
            return response()->json([
                'message' => 'Cannot delete client with existing projects'
            ], 422);
        }

        $client->delete();

        return response()->json([
            'message' => 'Client deleted successfully'
        ]);
    }

    public function getActiveClients()
    {
        $user = auth()->user();
        $clients = Client::where('status', 'active')
            ->when($user->role !== 'admin', function ($query) use ($user) {
                $query->whereHas('projects', function ($pq) use ($user) {
                    $pq->where('manager_id', $user->id)
                       ->orWhereHas('tasks', function ($tq) use ($user) {
                           $tq->where('assigned_to', $user->id);
                       });
                });
            })
            ->orderBy('name')
            ->get();

        return response()->json($clients);
    }
}
