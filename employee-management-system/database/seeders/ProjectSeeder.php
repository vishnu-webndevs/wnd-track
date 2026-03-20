<?php

namespace Database\Seeders;

use App\Models\Project;
use App\Models\Client;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class ProjectSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $clients = Client::all();
        $managers = User::where('role', 'admin')->orWhere('department', 'Management')->get();

        $projects = [
            [
                'name' => 'E-commerce Platform Redesign',
                'description' => 'Complete redesign and development of the e-commerce platform with modern UI/UX',
                'status' => 'in_progress',
                'start_date' => '2024-01-15',
                'end_date' => '2024-06-30',
                'budget' => 75000.00,
                'priority' => 'high',
                'notes' => 'High priority project for main client',
            ],
            [
                'name' => 'Mobile App Development',
                'description' => 'Native mobile application for iOS and Android platforms',
                'status' => 'planning',
                'start_date' => '2024-03-01',
                'end_date' => '2024-09-15',
                'budget' => 120000.00,
                'priority' => 'urgent',
                'notes' => 'Critical project with tight deadline',
            ],
            [
                'name' => 'Marketing Campaign Website',
                'description' => 'Landing page and marketing website for new product launch',
                'status' => 'completed',
                'start_date' => '2023-11-01',
                'end_date' => '2023-12-15',
                'budget' => 25000.00,
                'priority' => 'medium',
                'notes' => 'Successfully completed marketing campaign',
            ],
            [
                'name' => 'CRM System Integration',
                'description' => 'Integration of third-party CRM system with existing infrastructure',
                'status' => 'on_hold',
                'start_date' => '2024-02-01',
                'end_date' => '2024-05-31',
                'budget' => 45000.00,
                'priority' => 'medium',
                'notes' => 'Project on hold pending client approval',
            ],
            [
                'name' => 'Data Analytics Dashboard',
                'description' => 'Custom analytics dashboard for business intelligence',
                'status' => 'in_progress',
                'start_date' => '2024-04-01',
                'end_date' => '2024-08-31',
                'budget' => 55000.00,
                'priority' => 'high',
                'notes' => 'Complex dashboard with real-time data processing',
            ],
        ];

        foreach ($projects as $index => $project) {
            Project::create([
                'name' => $project['name'],
                'description' => $project['description'],
                'client_id' => $clients->random()->id,
                'manager_id' => $managers->random()->id,
                'status' => $project['status'],
                'start_date' => $project['start_date'],
                'end_date' => $project['end_date'],
                'budget' => $project['budget'],
                'priority' => $project['priority'],
                'notes' => $project['notes'],
            ]);
        }
    }
}
