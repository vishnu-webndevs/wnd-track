<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Create admin user
        User::create([
            'name' => 'Admin User',
            'email' => 'admin@company.com',
            'password' => Hash::make('password123'),
            'role' => 'admin',
            'phone' => '+1234567890',
            'department' => 'Management',
            'position' => 'System Administrator',
            'status' => 'active',
            'hire_date' => '2020-01-01',
        ]);

        // Create sample employees
        $employees = [
            [
                'name' => 'John Smith',
                'email' => 'john.smith@company.com',
                'password' => Hash::make('password123'),
                'role' => 'employee',
                'phone' => '+1234567891',
                'department' => 'Development',
                'position' => 'Senior Developer',
                'status' => 'active',
                'hire_date' => '2021-03-15',
            ],
            [
                'name' => 'Sarah Johnson',
                'email' => 'sarah.johnson@company.com',
                'password' => Hash::make('password123'),
                'role' => 'employee',
                'phone' => '+1234567892',
                'department' => 'Design',
                'position' => 'UI/UX Designer',
                'status' => 'active',
                'hire_date' => '2021-06-20',
            ],
            [
                'name' => 'Michael Brown',
                'email' => 'michael.brown@company.com',
                'password' => Hash::make('password123'),
                'role' => 'employee',
                'phone' => '+1234567893',
                'department' => 'Marketing',
                'position' => 'Marketing Manager',
                'status' => 'active',
                'hire_date' => '2020-11-10',
            ],
            [
                'name' => 'Emily Davis',
                'email' => 'emily.davis@company.com',
                'password' => Hash::make('password123'),
                'role' => 'employee',
                'phone' => '+1234567894',
                'department' => 'Development',
                'position' => 'Junior Developer',
                'status' => 'active',
                'hire_date' => '2022-01-15',
            ],
            [
                'name' => 'David Wilson',
                'email' => 'david.wilson@company.com',
                'password' => Hash::make('password123'),
                'role' => 'employee',
                'phone' => '+1234567895',
                'department' => 'Sales',
                'position' => 'Sales Representative',
                'status' => 'inactive',
                'hire_date' => '2020-08-05',
            ],
        ];

        foreach ($employees as $employee) {
            User::create($employee);
        }
    }
}
