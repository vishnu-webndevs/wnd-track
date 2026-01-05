import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit, Trash2, CheckSquare } from 'lucide-react';
import { tasksAPI } from '../api/tasks';
import { projectsAPI } from '../api/projects';
import { usersAPI } from '../api/users';
import { useAuthStore } from '../stores/authStore';
import LoadingSpinner from '../components/LoadingSpinner';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import type { AxiosError } from 'axios';
import type { Task, Project, User } from '../types';

const statusOptions = ['pending', 'in_progress', 'completed', 'cancelled'] as const;
const priorityOptions = ['low', 'medium', 'high', 'urgent'] as const;

const createSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  project_id: z.number(),
  assigned_to: z.number().optional(),
  status: z.enum(statusOptions),
  priority: z.enum(priorityOptions),
  due_date: z.string().optional(),
  estimated_hours: z.number().optional(),
  notes: z.string().optional(),
});

const editSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  project_id: z.number(),
  assigned_to: z.number().optional(),
  status: z.enum(statusOptions),
  priority: z.enum(priorityOptions),
  due_date: z.string().optional(),
  estimated_hours: z.number().optional(),
  actual_hours: z.number().optional(),
  notes: z.string().optional(),
});

type CreateTaskForm = z.infer<typeof createSchema>;
type EditTaskForm = z.infer<typeof editSchema>;

export default function Tasks() {
  const { user: currentUser } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [projectFilter, setProjectFilter] = useState<number | undefined>(undefined);
  const [assignedFilter, setAssignedFilter] = useState<number | undefined>(undefined);
  const [page, setPage] = useState<number>(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [viewMode, setViewMode] = useState<'board' | 'table'>('board');
  const queryClient = useQueryClient();

  const { data: tasks, isLoading } = useQuery<{ data: Task[]; current_page: number; last_page: number }>({
    queryKey: ['tasks', searchTerm, statusFilter, priorityFilter, projectFilter, assignedFilter, page],
    queryFn: () => tasksAPI.getTasks({
      search: searchTerm,
      status: statusFilter as typeof statusOptions[number] | undefined,
      priority: priorityFilter as typeof priorityOptions[number] | undefined,
      project_id: projectFilter,
      assigned_to: assignedFilter,
      page,
    }),
  });

  const { data: projects } = useQuery<{ data: Project[] }>({
    queryKey: ['projects', 'for-tasks'],
    queryFn: () => projectsAPI.getProjects({ page: 1 }),
  });

  const { data: users } = useQuery<{ data: User[] }>({
    queryKey: ['users', 'for-tasks'],
    queryFn: () => usersAPI.getUsers({ page: 1 }),
  });

  const projectOptions = useMemo(() => (projects?.data ?? []), [projects]);
  const userOptions = useMemo(() => (users?.data ?? []), [users]);

  const createForm = useForm<CreateTaskForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { status: 'pending', priority: 'medium' },
  });
  const editForm = useForm<EditTaskForm>({ resolver: zodResolver(editSchema) });

  const createMutation = useMutation({
    mutationFn: (payload: CreateTaskForm) => tasksAPI.createTask(payload),
    onSuccess: () => {
      toast.success('Task created');
      setIsCreateOpen(false);
      createForm.reset();
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (error: unknown) => {
      const err = error as AxiosError<{ message?: string; errors?: Record<string, string[]> }>;
      toast.error(err.response?.data?.message ?? 'Failed to create task');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: number; data: Partial<EditTaskForm> }) => tasksAPI.updateTask(payload.id, payload.data),
    onSuccess: () => {
      toast.success('Task updated');
      setIsEditOpen(false);
      setSelectedTask(null);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (error: unknown) => {
      const err = error as AxiosError<{ message?: string }>;
      toast.error(err.response?.data?.message ?? 'Failed to update task');
    },
  });

  

  const handleReorderDrop = async (
    draggedId: number,
    targetStatus: typeof statusOptions[number],
    newOrder: number[]
  ) => {
    try {
      const draggedTask = (tasks as { data: Task[] } | undefined)?.data.find((t) => t.id === draggedId);
      if (draggedTask && draggedTask.status !== targetStatus) {
        await tasksAPI.updateStatus(draggedId, targetStatus);
      }
      await tasksAPI.reorder(targetStatus, newOrder);
      toast.success('Tasks reordered');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    } catch {
      toast.error('Failed to reorder tasks');
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (id: number) => tasksAPI.deleteTask(id),
    onSuccess: () => {
      toast.success('Task deleted');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (error: unknown) => {
      const err = error as AxiosError<{ message?: string }>;
      toast.error(err.response?.data?.message ?? 'Failed to delete task');
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
        <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border overflow-hidden">
            <button
              className={`px-3 py-2 text-sm ${viewMode === 'board' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700'}`}
              onClick={() => setViewMode('board')}
            >
              Board
            </button>
            <button
              className={`px-3 py-2 text-sm ${viewMode === 'table' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700'}`}
              onClick={() => setViewMode('table')}
            >
              Table
            </button>
          </div>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Task
          </button>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search tasks..."
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
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="">All Priority</option>
              {priorityOptions.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              value={projectFilter ?? ''}
              onChange={(e) => setProjectFilter(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">All Projects</option>
              {projectOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              value={assignedFilter ?? ''}
              onChange={(e) => setAssignedFilter(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">All Assignees</option>
              {userOptions.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {viewMode === 'table' ? (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Project</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-center">
                      <LoadingSpinner size="md" />
                    </td>
                  </tr>
                ) : (tasks as { data: Task[] } | undefined)?.data.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-center text-gray-500">No tasks found</td>
                  </tr>
                ) : (
                  (tasks as { data: Task[] } | undefined)?.data.map((task) => (
                    <tr key={task.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                              <CheckSquare className="h-5 w-5 text-gray-500" />
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{task.title}</div>
                            <div className="text-sm text-gray-500">{task.project?.name || '-'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{task.project?.name || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{task.assignedTo?.name || task.assigned_employee?.name || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${task.status === 'completed' ? 'bg-green-100 text-green-800' : task.status === 'in_progress' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                          {task.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{task.priority}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            className="text-indigo-600 hover:text-indigo-900"
                            onClick={() => {
                              setSelectedTask(task);
                              setIsEditOpen(true);
                              editForm.reset({
                                title: task.title,
                                description: task.description ?? '',
                                project_id: task.project_id,
                                assigned_to: task.assigned_to ?? undefined,
                                status: task.status,
                                priority: task.priority,
                                due_date: task.due_date ?? '',
                                estimated_hours: task.estimated_hours ?? undefined,
                                actual_hours: task.actual_hours ?? undefined,
                                notes: task.notes ?? '',
                              });
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            className="text-red-600 hover:text-red-900"
                            onClick={() => {
                              if (window.confirm('Delete this task?')) {
                                deleteMutation.mutate(task.id);
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {statusOptions.map((status) => {
            const list = (tasks as { data: Task[] } | undefined)?.data?.filter((t) => t.status === status) ?? [];
            return (
              <div
                key={status}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const draggedId = Number(e.dataTransfer.getData('text/plain'));
                  if (!draggedId) return;
                  const listIds = list.map((t) => t.id);
                  const newOrder = [...listIds.filter((id) => id !== draggedId), draggedId];
                  handleReorderDrop(draggedId, status, newOrder);
                }}
                className="bg-white shadow rounded-lg p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold capitalize">{status.replace('_', ' ')}</h3>
                  <span className="text-xs rounded-full px-2 py-0.5 bg-gray-100 text-gray-600">{list.length}</span>
                </div>
                <div className="space-y-2 min-h-[240px] rounded border border-dashed border-gray-200 p-2">
                  {isLoading ? (
                    <div className="py-6"><LoadingSpinner size="sm" /></div>
                  ) : list.length === 0 ? (
                    <div className="text-xs text-gray-400">Drop tasks here</div>
                  ) : (
                    list.map((task) => (
                      <div
                        key={task.id}
                        className="rounded border bg-white p-3 shadow-sm"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', String(task.id));
                          e.dataTransfer.setData('fromStatus', task.status);
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const draggedId = Number(e.dataTransfer.getData('text/plain'));
                          if (!draggedId || draggedId === task.id) return;
                          const listIds = list.map((t) => t.id);
                          const filtered = listIds.filter((id) => id !== draggedId);
                          const insertIndex = filtered.indexOf(task.id);
                          const newOrder = [
                            ...filtered.slice(0, insertIndex),
                            draggedId,
                            ...filtered.slice(insertIndex),
                          ];
                          handleReorderDrop(draggedId, status, newOrder);
                        }}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{task.title}</div>
                            <div className="text-xs text-gray-500">{task.project?.name ?? '-'}</div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              className="text-indigo-600 hover:text-indigo-900"
                              onClick={() => {
                                setSelectedTask(task);
                                setIsEditOpen(true);
                                editForm.reset({
                                  title: task.title,
                                  description: task.description ?? '',
                                  project_id: task.project_id,
                                  assigned_to: task.assigned_to ?? undefined,
                                  status: task.status,
                                  priority: task.priority,
                                  due_date: task.due_date ?? '',
                                  estimated_hours: task.estimated_hours ?? undefined,
                                  actual_hours: task.actual_hours ?? undefined,
                                  notes: task.notes ?? '',
                                });
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              className="text-red-600 hover:text-red-900"
                              onClick={() => {
                                if (window.confirm('Delete this task?')) {
                                  deleteMutation.mutate(task.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
                          <span className="capitalize">{task.priority}</span>
                          <span>{task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}</span>
                        </div>
                        <div className="mt-1 text-xs text-gray-500">{task.assignedTo?.name || task.assigned_employee?.name || '-'}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          className="px-3 py-1 rounded border text-sm disabled:opacity-50"
          disabled={!tasks || (tasks as { current_page: number }).current_page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Previous
        </button>
        <div className="text-sm text-gray-600">
          Page {(tasks as { current_page: number } | undefined)?.current_page ?? page} of {(tasks as { last_page: number } | undefined)?.last_page ?? 1}
        </div>
        <button
          className="px-3 py-1 rounded border text-sm disabled:opacity-50"
          disabled={!tasks || (tasks as { current_page: number; last_page: number }).current_page >= (tasks as { current_page: number; last_page: number }).last_page}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold">Add Task</h3>
            </div>
            <form
              className="px-6 py-4 space-y-4"
              onSubmit={createForm.handleSubmit((values) => {
                const payload = {
                  ...values,
                  estimated_hours: values.estimated_hours ?? undefined,
                  assigned_to: values.assigned_to ?? undefined,
                };
                createMutation.mutate(payload);
              })}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Title</label>
                  <input {...createForm.register('title')} className="mt-1 block w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Project</label>
                  <select {...createForm.register('project_id', { valueAsNumber: true })} className="mt-1 block w-full border rounded px-3 py-2">
                    <option value="">Select project</option>
                    {projectOptions.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Assigned To</label>
                  <select {...createForm.register('assigned_to', { valueAsNumber: true })} className="mt-1 block w-full border rounded px-3 py-2">
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
                  <label className="block text-sm font-medium text-gray-700">Due Date</label>
                  <input {...createForm.register('due_date')} type="date" className="mt-1 block w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Estimated Hours</label>
                  <input {...createForm.register('estimated_hours', { valueAsNumber: true })} type="number" step="1" className="mt-1 block w-full border rounded px-3 py-2" />
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

      {isEditOpen && selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold">Edit Task</h3>
            </div>
            <form
              className="px-6 py-4 space-y-4"
              onSubmit={editForm.handleSubmit((values) => {
                updateMutation.mutate({ id: selectedTask!.id, data: values });
              })}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Title</label>
                  <input {...editForm.register('title')} className="mt-1 block w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Project</label>
                  <select {...editForm.register('project_id', { valueAsNumber: true })} className="mt-1 block w-full border rounded px-3 py-2">
                    {projectOptions.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Assigned To</label>
                  <select {...editForm.register('assigned_to', { valueAsNumber: true })} className="mt-1 block w-full border rounded px-3 py-2">
                    <option value="">Optional</option>
                    {userOptions.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Status</label>
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
                  <label className="block text-sm font-medium text-gray-700">Due Date</label>
                  <input {...editForm.register('due_date')} type="date" className="mt-1 block w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Estimated Hours</label>
                  <input {...editForm.register('estimated_hours', { valueAsNumber: true })} type="number" step="1" className="mt-1 block w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Actual Hours</label>
                  <input {...editForm.register('actual_hours', { valueAsNumber: true })} type="number" step="1" className="mt-1 block w-full border rounded px-3 py-2" />
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
                <button type="button" className="px-4 py-2 rounded border" onClick={() => { setIsEditOpen(false); setSelectedTask(null); }}>Cancel</button>
                <button type="submit" className="px-4 py-2 rounded bg-indigo-600 text-white">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
