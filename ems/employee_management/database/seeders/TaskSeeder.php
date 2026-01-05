<?php

namespace Database\Seeders;

use App\Models\Task;
use App\Models\Project;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class TaskSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $projects = Project::all();
        $employees = User::where('role', 'employee')->get();
        $admins = User::where('role', 'admin')->get();

        $tasks = [
            [
                'title' => 'Design Homepage Mockup',
                'description' => 'Create high-fidelity mockup for the new homepage design',
                'status' => 'completed',
                'priority' => 'high',
                'due_date' => '2024-01-20',
                'estimated_hours' => 16,
                'actual_hours' => 14,
            ],
            [
                'title' => 'Implement User Authentication',
                'description' => 'Set up secure user authentication system with JWT tokens',
                'status' => 'in_progress',
                'priority' => 'urgent',
                'due_date' => '2024-02-15',
                'estimated_hours' => 24,
                'actual_hours' => 18,
            ],
            [
                'title' => 'Database Schema Design',
                'description' => 'Design and implement database schema for the application',
                'status' => 'pending',
                'priority' => 'high',
                'due_date' => '2024-03-01',
                'estimated_hours' => 12,
                'actual_hours' => null,
            ],
            [
                'title' => 'API Documentation',
                'description' => 'Write comprehensive API documentation for all endpoints',
                'status' => 'pending',
                'priority' => 'medium',
                'due_date' => '2024-02-28',
                'estimated_hours' => 8,
                'actual_hours' => null,
            ],
            [
                'title' => 'Mobile Responsive Testing',
                'description' => 'Test application responsiveness across different mobile devices',
                'status' => 'in_progress',
                'priority' => 'medium',
                'due_date' => '2024-02-25',
                'estimated_hours' => 20,
                'actual_hours' => 12,
            ],
            [
                'title' => 'Performance Optimization',
                'description' => 'Optimize application performance and loading times',
                'status' => 'pending',
                'priority' => 'low',
                'due_date' => '2024-03-15',
                'estimated_hours' => 16,
                'actual_hours' => null,
            ],
            [
                'title' => 'Security Audit',
                'description' => 'Conduct comprehensive security audit of the application',
                'status' => 'pending',
                'priority' => 'high',
                'due_date' => '2024-02-20',
                'estimated_hours' => 10,
                'actual_hours' => null,
            ],
            [
                'title' => 'User Training Materials',
                'description' => 'Create user training materials and documentation',
                'status' => 'completed',
                'priority' => 'medium',
                'due_date' => '2024-01-30',
                'estimated_hours' => 6,
                'actual_hours' => 8,
            ],
        ];

        foreach ($tasks as $taskData) {
            Task::create([
                'title' => $taskData['title'],
                'description' => $taskData['description'],
                'project_id' => $projects->random()->id,
                'assigned_to' => $employees->random()->id,
                'created_by' => $admins->random()->id,
                'status' => $taskData['status'],
                'priority' => $taskData['priority'],
                'due_date' => $taskData['due_date'],
                'estimated_hours' => $taskData['estimated_hours'],
                'actual_hours' => $taskData['actual_hours'],
                'notes' => 'Sample task created for demonstration purposes',
            ]);
        }
    }
}
