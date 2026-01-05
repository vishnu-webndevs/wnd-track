<?php

namespace Database\Seeders;

use App\Models\Client;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class ClientSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $clients = [
            [
                'name' => 'TechCorp Solutions',
                'email' => 'contact@techcorp.com',
                'phone' => '+1987654321',
                'address' => '123 Tech Street, Silicon Valley, CA 94025',
                'company' => 'TechCorp Solutions Inc.',
                'website' => 'https://techcorp.com',
                'status' => 'active',
                'notes' => 'Long-term client, excellent payment history',
            ],
            [
                'name' => 'Global Marketing Group',
                'email' => 'info@globalmarketing.com',
                'phone' => '+1876543210',
                'address' => '456 Marketing Ave, New York, NY 10001',
                'company' => 'Global Marketing Group LLC',
                'website' => 'https://globalmarketing.com',
                'status' => 'active',
                'notes' => 'New client with multiple ongoing projects',
            ],
            [
                'name' => 'Innovation Labs',
                'email' => 'hello@innovationlabs.com',
                'phone' => '+1765432109',
                'address' => '789 Innovation Blvd, Boston, MA 02101',
                'company' => 'Innovation Labs Co.',
                'website' => 'https://innovationlabs.com',
                'status' => 'active',
                'notes' => 'Startup client with exciting projects',
            ],
            [
                'name' => 'Digital Dynamics',
                'email' => 'support@digitaldynamics.com',
                'phone' => '+1654321098',
                'address' => '321 Digital Way, Austin, TX 78701',
                'company' => 'Digital Dynamics Ltd.',
                'website' => 'https://digitaldynamics.com',
                'status' => 'inactive',
                'notes' => 'Previous client, potential for reactivation',
            ],
            [
                'name' => 'Creative Studios',
                'email' => 'projects@creativestudios.com',
                'phone' => '+1543210987',
                'address' => '654 Creative Lane, Los Angeles, CA 90001',
                'company' => 'Creative Studios Agency',
                'website' => 'https://creativestudios.com',
                'status' => 'active',
                'notes' => 'Design-focused client with creative projects',
            ],
        ];

        foreach ($clients as $client) {
            Client::create($client);
        }
    }
}
