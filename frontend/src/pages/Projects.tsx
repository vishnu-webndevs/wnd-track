import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit, Trash2, Briefcase } from 'lucide-react';
import { projectsAPI } from '../api/projects';
import { clientsAPI } from '../api/clients';
import { usersAPI } from '../api/users';
import { useAuthStore } from '../stores/authStore';
import LoadingSpinner from '../components/LoadingSpinner';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import type { AxiosError } from 'axios';
import type { Project, Client, User } from '../types';

const statusOptions = ['planning', 'in_progress', 'completed', 'on_hold', 'cancelled'] as const;
const priorityOptions = ['low', 'medium', 'high', 'urgent'] as const;

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  client_id: z.number(),
  manager_id: z.number().optional(),
  status: z.enum(statusOptions),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  budget: z.number().optional(),
  priority: z.enum(priorityOptions),
  notes: z.string().optional(),
});

const editSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  client_id: z.number(),
  manager_id: z.number().optional(),
  status: z.enum(statusOptions),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  budget: z.number().optional(),
  priority: z.enum(priorityOptions),
  notes: z.string().optional(),
});

type CreateProjectForm = z.infer<typeof createSchema>;
type EditProjectForm = z.infer<typeof editSchema>;

export default function Projects() {
  const { user: currentUser } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [clientFilter, setClientFilter] = useState<number | undefined>(undefined);
  const [managerFilter, setManagerFilter] = useState<number | undefined>(undefined);
  const [page, setPage] = useState<number>(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const queryClient = useQueryClient();

  const { data: projects, isLoading } = useQuery<{ data: Project[]; current_page: number; last_page: number }>({
    queryKey: ['projects', searchTerm, statusFilter, clientFilter, managerFilter, page],
    queryFn: () => projectsAPI.getProjects({
      search: searchTerm,
      status: statusFilter as typeof statusOptions[number] | undefined,
      client_id: clientFilter,
      manager_id: managerFilter,
      page,
    }),
  });

  const { data: clients } = useQuery<{ data: Client[] }>({
    queryKey: ['clients', 'for-projects'],
    queryFn: () => clientsAPI.getClients({ page: 1 }),
  });

  const { data: users } = useQuery<{ data: User[] }>({
    queryKey: ['users', 'for-projects'],
    queryFn: () => usersAPI.getUsers({ page: 1 }),
    enabled: currentUser?.role === 'admin',
  });

  const clientOptions = useMemo(() => (clients?.data ?? []), [clients]);
  const userOptions = useMemo(() => (users?.data ?? []), [users]);

  const createForm = useForm<CreateProjectForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { status: 'planning', priority: 'medium' },
  });
  const editForm = useForm<EditProjectForm>({ resolver: zodResolver(editSchema) });

  const createMutation = useMutation({
    mutationFn: (payload: CreateProjectForm) => projectsAPI.createProject(payload),
    onSuccess: () => {
      toast.success('Project created');
      setIsCreateOpen(false);
      createForm.reset();
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (error: unknown) => {
      const err = error as AxiosError<{ message?: string; errors?: Record<string, string[]> }>;
      toast.error(err.response?.data?.message ?? 'Failed to create project');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: number; data: Partial<EditProjectForm> }) => projectsAPI.updateProject(payload.id, payload.data),
    onSuccess: () => {
      toast.success('Project updated');
      setIsEditOpen(false);
      setSelectedProject(null);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (error: unknown) => {
      const err = error as AxiosError<{ message?: string }>;
      toast.error(err.response?.data?.message ?? 'Failed to update project');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => projectsAPI.deleteProject(id),
    onSuccess: () => {
      toast.success('Project deleted');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (error: unknown) => {
      const err = error as AxiosError<{ message?: string }>;
      toast.error(err.response?.data?.message ?? 'Failed to delete project');
    },
  });

  if (!currentUser) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">You need to be logged in.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Project
        </button>
      </div>

      <div className="bg-white shadow rounded-lg p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search projects..."
                className="pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 w-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <select
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Status</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              value={clientFilter ?? ''}
              onChange={(e) => setClientFilter(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">All Clients</option>
              {clientOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              value={managerFilter ?? ''}
              onChange={(e) => setManagerFilter(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">All Managers</option>
              {userOptions.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Manager</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center">
                    <LoadingSpinner size="md" />
                  </td>
                </tr>
              ) : (projects as { data: Project[] } | undefined)?.data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-gray-500">No projects found</td>
                </tr>
              ) : (
                (projects as { data: Project[] } | undefined)?.data.map((project) => (
                  <tr key={project.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                            <Briefcase className="h-5 w-5 text-gray-500" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{project.name}</div>
                          <div className="text-sm text-gray-500">{project.client?.name || '-'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{project.client?.name || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{project.manager?.name || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${project.status === 'in_progress' ? 'bg-green-100 text-green-800' : project.status === 'completed' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {project.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{project.priority}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          className="text-indigo-600 hover:text-indigo-900"
                          onClick={() => {
                            setSelectedProject(project);
                            setIsEditOpen(true);
                            editForm.reset({
                              name: project.name,
                              description: project.description ?? '',
                              client_id: project.client_id,
                              manager_id: project.manager_id ?? undefined,
                              status: project.status,
                              start_date: project.start_date ?? '',
                              end_date: project.end_date ?? '',
                              budget: project.budget ?? undefined,
                              priority: project.priority,
                              notes: project.notes ?? '',
                            });
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          className="text-red-600 hover:text-red-900"
                          onClick={() => {
                            if (window.confirm('Delete this project?')) {
                              deleteMutation.mutate(project.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          className="px-3 py-1 rounded border text-sm disabled:opacity-50"
          disabled={!projects || (projects as { current_page: number }).current_page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Previous
        </button>
        <div className="text-sm text-gray-600">
          Page {(projects as { current_page: number } | undefined)?.current_page ?? page} of {(projects as { last_page: number } | undefined)?.last_page ?? 1}
        </div>
        <button
          className="px-3 py-1 rounded border text-sm disabled:opacity-50"
          disabled={!projects || (projects as { current_page: number; last_page: number }).current_page >= (projects as { current_page: number; last_page: number }).last_page}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold">Add Project</h3>
            </div>
            <form
              className="px-6 py-4 space-y-4"
              onSubmit={createForm.handleSubmit((values) => {
                const payload = {
                  ...values,
                  budget: values.budget ?? undefined,
                  manager_id: values.manager_id ?? undefined,
                };
                createMutation.mutate(payload);
              })}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input {...createForm.register('name')} className="mt-1 block w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Client</label>
                  <select {...createForm.register('client_id', { valueAsNumber: true })} className="mt-1 block w-full border rounded px-3 py-2">
                    <option value="">Select client</option>
                    {clientOptions.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Manager</label>
                  <select {...createForm.register('manager_id', { valueAsNumber: true })} className="mt-1 block w-full border rounded px-3 py-2">
                    <option value="">Optional</option>
                    {userOptions.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Status</label>
                  <select {...createForm.register('status')} className="mt-1 block w-full border rounded px-3 py-2">
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Priority</label>
                  <select {...createForm.register('priority')} className="mt-1 block w-full border rounded px-3 py-2">
                    {priorityOptions.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Budget</label>
                  <input {...createForm.register('budget', { valueAsNumber: true })} type="number" step="0.01" className="mt-1 block w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Start Date</label>
                  <input {...createForm.register('start_date')} type="date" className="mt-1 block w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">End Date</label>
                  <input {...createForm.register('end_date')} type="date" className="mt-1 block w-full border rounded px-3 py-2" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <textarea {...createForm.register('description')} className="mt-1 block w-full border rounded px-3 py-2" rows={3} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Notes</label>
                  <textarea {...createForm.register('notes')} className="mt-1 block w-full border rounded px-3 py-2" rows={3} />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" className="px-4 py-2 rounded border" onClick={() => setIsCreateOpen(false)}>Cancel</button>
                <button type="submit" className="px-4 py-2 rounded bg-indigo-600 text-white">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isEditOpen && selectedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold">Edit Project</h3>
            </div>
            <form
              className="px-6 py-4 space-y-4"
              onSubmit={editForm.handleSubmit((values) => {
                updateMutation.mutate({ id: selectedProject!.id, data: values });
              })}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input {...editForm.register('name')} className="mt-1 block w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Client</label>
                  <select {...editForm.register('client_id', { valueAsNumber: true })} className="mt-1 block w-full border rounded px-3 py-2">
                    {clientOptions.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Manager</label>
                  <select {...editForm.register('manager_id', { valueAsNumber: true })} className="mt-1 block w-full border rounded px-3 py-2">
                    <option value="">Optional</option>
                    {userOptions.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text sm font-medium text-gray-700">Status</label>
                  <select {...editForm.register('status')} className="mt-1 block w-full border rounded px-3 py-2">
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Priority</label>
                  <select {...editForm.register('priority')} className="mt-1 block w-full border rounded px-3 py-2">
                    {priorityOptions.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Budget</label>
                  <input {...editForm.register('budget', { valueAsNumber: true })} type="number" step="0.01" className="mt-1 block w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Start Date</label>
                  <input {...editForm.register('start_date')} type="date" className="mt-1 block w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">End Date</label>
                  <input {...editForm.register('end_date')} type="date" className="mt-1 block w-full border rounded px-3 py-2" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <textarea {...editForm.register('description')} className="mt-1 block w-full border rounded px-3 py-2" rows={3} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Notes</label>
                  <textarea {...editForm.register('notes')} className="mt-1 block w-full border rounded px-3 py-2" rows={3} />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" className="px-4 py-2 rounded border" onClick={() => { setIsEditOpen(false); setSelectedProject(null); }}>Cancel</button>
                <button type="submit" className="px-4 py-2 rounded bg-indigo-600 text-white">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
