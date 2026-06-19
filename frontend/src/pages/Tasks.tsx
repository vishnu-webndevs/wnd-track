import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit, Trash2, CheckSquare, Eye } from 'lucide-react';
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
  assignee_ids: z.union([z.array(z.string()), z.array(z.number())]).optional(),
  status: z.enum(statusOptions),
  priority: z.enum(priorityOptions),
  due_date: z.string().optional(),
  estimated_hours: z.union([z.number(), z.nan()]).transform((val) => (Number.isNaN(val) ? undefined : val)).optional(),
  notes: z.string().optional(),
});

const editSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  project_id: z.number(),
  assigned_to: z.number().optional(),
  assignee_ids: z.union([z.array(z.string()), z.array(z.number())]).optional(),
  status: z.enum(statusOptions),
  priority: z.enum(priorityOptions),
  due_date: z.string().optional(),
  estimated_hours: z.union([z.number(), z.nan()]).transform((val) => (Number.isNaN(val) ? undefined : val)).optional(),
  actual_hours: z.union([z.number(), z.nan()]).transform((val) => (Number.isNaN(val) ? undefined : val)).optional(),
  notes: z.string().optional(),
});

type CreateTaskForm = z.infer<typeof createSchema>;
type EditTaskForm = z.infer<typeof editSchema>;

const getDisplayAssignees = (task: Task) => {
  if (task.assignees && task.assignees.length > 0) return task.assignees;
  if (task.assignedTo) return [task.assignedTo];
  if (task.assigned_employee) return [task.assigned_employee];
  if (typeof task.assigned_to === 'object' && task.assigned_to !== null) return [task.assigned_to as unknown as User];
  return [];
};

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
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [viewMode, setViewMode] = useState<'board' | 'table'>('board');
  const queryClient = useQueryClient();

  const { data: tasks, isLoading: isTableLoading } = useQuery<{ data: Task[]; current_page: number; last_page: number }>({
    queryKey: ['tasks', searchTerm, statusFilter, priorityFilter, projectFilter, assignedFilter, page],
    queryFn: () => tasksAPI.getTasks({
      search: searchTerm,
      status: statusFilter as typeof statusOptions[number] | undefined,
      priority: priorityFilter as typeof priorityOptions[number] | undefined,
      project_id: projectFilter,
      assigned_to: assignedFilter,
      page,
      per_page: 10, // Table view pagination
    }),
    enabled: viewMode === 'table',
  });

  const boardStatuses = useMemo(() => {
    if (statusFilter === '') {
      return ['pending', 'in_progress', 'cancelled'];
    }
    return [statusFilter];
  }, [statusFilter]);

  const boardQueries = useQueries({
    queries: boardStatuses.map((status) => ({
      queryKey: ['tasks-board', status, searchTerm, priorityFilter, projectFilter, assignedFilter, page],
      queryFn: () => tasksAPI.getTasks({
        search: searchTerm,
        status: status as any,
        priority: priorityFilter as any,
        project_id: projectFilter,
        assigned_to: assignedFilter,
        page,
        per_page: 10,
      }),
      enabled: viewMode === 'board',
    })),
  });

  const isBoardLoading = viewMode === 'board' && boardQueries.some((q) => q.isLoading);
  const isLoading = viewMode === 'table' ? isTableLoading : isBoardLoading;

  const boardData = useMemo(() => {
    const data: Record<string, { data: Task[]; current_page: number; last_page: number }> = {};
    boardStatuses.forEach((status, index) => {
      const qData = boardQueries[index]?.data;
      if (qData) {
        data[status] = qData;
      } else {
        data[status] = { data: [], current_page: page, last_page: 1 };
      }
    });
    return data;
  }, [boardStatuses, boardQueries, page]);

  const lastPage = useMemo(() => {
    if (viewMode === 'table') {
      return tasks?.last_page ?? 1;
    }
    const pages = boardQueries.map((q) => q.data?.last_page ?? 1);
    return Math.max(1, ...pages);
  }, [viewMode, tasks, boardQueries]);

  const currentPage = useMemo(() => {
    if (viewMode === 'table') {
      return tasks?.current_page ?? page;
    }
    return page;
  }, [viewMode, tasks, page]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter, priorityFilter, projectFilter, assignedFilter, viewMode]);

  const { data: projects } = useQuery<{ data: Project[] }>({
    queryKey: ['projects', 'for-tasks'],
    queryFn: () => projectsAPI.getProjects({ per_page: 1000 }), // All for dropdown
  });

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'project_manager';

  const { data: users } = useQuery<{ data: User[] }>({
    queryKey: ['users', 'for-tasks'],
    queryFn: () => usersAPI.getUsers({ per_page: 1000, status: 'active' }), // All active for dropdown
    enabled: isAdmin,
  });

  const projectOptions = useMemo(() => (projects?.data ?? []), [projects]);
  const userOptions = useMemo(() => {
    let options: User[] = [];
    if (!isAdmin) {
      options = currentUser ? [currentUser as unknown as User] : [];
    } else {
      options = users?.data ?? [];
    }

    // Ensure the assigned user is in the list (in case of pagination or restricted view)
    let assignedUser = selectedTask?.assignedTo ?? selectedTask?.assigned_employee ?? (typeof selectedTask?.assigned_to === 'object' && selectedTask?.assigned_to !== null ? selectedTask?.assigned_to as unknown as User : undefined);
    const assignedIdVal = selectedTask?.assigned_to;

    // Handle case where assigned_to is an object (User) instead of number
    const assignedId = typeof assignedIdVal === 'object' && assignedIdVal !== null
      ? (assignedIdVal as unknown as User).id
      : assignedIdVal;

    // Fallback: If relation is missing but ID matches current user, use current user
    if (!assignedUser && assignedId && currentUser && Number(assignedId) === currentUser.id) {
      assignedUser = currentUser as unknown as User;
    }

    if (assignedUser && !options.find(u => u.id === assignedUser.id)) {
      options = [...options, assignedUser];
    }

    return options;
  }, [currentUser, isAdmin, users, selectedTask]);

  const createForm = useForm<CreateTaskForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { status: 'pending', priority: 'medium', assignee_ids: [] },
  });
  const editForm = useForm<EditTaskForm>({ resolver: zodResolver(editSchema) });

  // Reset edit form when selectedTask changes
  useEffect(() => {
    if (isEditOpen && selectedTask) {
      // Handle potential object in assigned_to
      const rawAssignedId = selectedTask.assigned_to;
      const safeAssignedId = typeof rawAssignedId === 'object' && rawAssignedId !== null
        ? (rawAssignedId as unknown as User).id
        : rawAssignedId;

      const assignedId = safeAssignedId ?? selectedTask.assignedTo?.id ?? selectedTask.assigned_employee?.id;

      let finalAssignedId: number | undefined;

      // Check if the assigned ID matches the current user (prioritize exact match)
      // This handles cases where relation is missing but ID is correct
      if (currentUser && assignedId && Number(assignedId) === currentUser.id) {
        finalAssignedId = currentUser.id;
      } else if (assignedId) {
        finalAssignedId = Number(assignedId);
      }

      // Prepopulate assignee_ids from task's assignees relation as array of strings
      const defaultAssignees = selectedTask.assignees && selectedTask.assignees.length > 0
        ? selectedTask.assignees.map((u) => String(u.id))
        : (finalAssignedId ? [String(finalAssignedId)] : []);

      editForm.reset({
        title: selectedTask.title,
        description: selectedTask.description ?? '',
        project_id: selectedTask.project_id,
        assigned_to: finalAssignedId,
        assignee_ids: defaultAssignees,
        status: selectedTask.status,
        priority: selectedTask.priority,
        due_date: selectedTask.due_date ?? '',
        estimated_hours: selectedTask.estimated_hours ?? undefined,
        actual_hours: selectedTask.actual_hours ?? undefined,
        notes: selectedTask.notes ?? '',
      });
    }
  }, [isEditOpen, selectedTask, isAdmin, currentUser, editForm]);

  const createMutation = useMutation({
    mutationFn: (payload: any) => tasksAPI.createTask(payload),
    onSuccess: () => {
      toast.success('Task created');
      setIsCreateOpen(false);
      createForm.reset();
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks-board'] });
    },
    onError: (error: unknown) => {
      const err = error as AxiosError<{ message?: string; errors?: Record<string, string[]> }>;
      toast.error(err.response?.data?.message ?? 'Failed to create task');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: number; data: any }) => tasksAPI.updateTask(payload.id, payload.data),
    onSuccess: () => {
      toast.success('Task updated');
      setIsEditOpen(false);
      setSelectedTask(null);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks-board'] });
    },
    onError: (error: unknown) => {
      const err = error as AxiosError<{ message?: string }>;
      toast.error(err.response?.data?.message ?? 'Failed to update task');
    },
  });



  const handleReorderDrop = async (
    draggedId: number,
    fromStatus: string,
    targetStatus: typeof statusOptions[number],
    newOrder: number[]
  ) => {
    try {
      if (fromStatus && fromStatus !== targetStatus) {
        await tasksAPI.updateStatus(draggedId, targetStatus);
      }
      await tasksAPI.reorder(targetStatus, newOrder);
      toast.success('Tasks reordered');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks-board'] });
    } catch {
      toast.error('Failed to reorder tasks');
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (id: number) => tasksAPI.deleteTask(id),
    onSuccess: () => {
      toast.success('Task deleted');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks-board'] });
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
        <div className="flex flex-col lg:flex-row gap-4">
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
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Status</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>{s === 'completed' ? 'Archive (Completed)' : s.replace('_', ' ')}</option>
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
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex -space-x-1 overflow-hidden">
                          {(() => {
                            const displayAssignees = getDisplayAssignees(task);
                            if (displayAssignees.length > 0) {
                              return displayAssignees.map((assignee) => {
                                const initials = assignee.name
                                  .split(' ')
                                  .map((n) => n[0])
                                  .join('')
                                  .substring(0, 2)
                                  .toUpperCase();
                                return (
                                  <div
                                    key={assignee.id}
                                    title={assignee.name}
                                    className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-medium text-indigo-800 ring-2 ring-white"
                                  >
                                    {initials}
                                  </div>
                                );
                              });
                            }
                            return <span className="text-sm text-gray-400">Unassigned</span>;
                          })()}
                        </div>
                      </td>
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
                            className="text-gray-600 hover:text-gray-900"
                            title="View"
                            onClick={() => {
                              setSelectedTask(task);
                              setIsViewOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            className="text-indigo-600 hover:text-indigo-900"
                            title="Edit"
                            onClick={() => {
                              setSelectedTask(task);
                              setIsEditOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          {isAdmin && (
                            <button
                              className="text-red-600 hover:text-red-900"
                              title="Delete"
                              onClick={() => {
                                if (window.confirm('Delete this task?')) {
                                  deleteMutation.mutate(task.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
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
        <div className={`grid grid-cols-1 ${boardStatuses.length === 1 ? 'md:grid-cols-1 max-w-xl mx-auto' : boardStatuses.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2 xl:grid-cols-4'} gap-4`}>
          {boardStatuses.map((status) => {
            const list = boardData[status]?.data ?? [];
            return (
              <div
                key={status}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const draggedId = Number(e.dataTransfer.getData('text/plain'));
                  const fromStatus = e.dataTransfer.getData('fromStatus');
                  if (!draggedId) return;
                  const listIds = list.map((t) => t.id);
                  const newOrder = [...listIds.filter((id) => id !== draggedId), draggedId];
                  handleReorderDrop(draggedId, fromStatus, status as any, newOrder);
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
                          const fromStatus = e.dataTransfer.getData('fromStatus');
                          if (!draggedId || draggedId === task.id) return;
                          const listIds = list.map((t) => t.id);
                          const filtered = listIds.filter((id) => id !== draggedId);
                          const insertIndex = filtered.indexOf(task.id);
                          const newOrder = [
                            ...filtered.slice(0, insertIndex),
                            draggedId,
                            ...filtered.slice(insertIndex),
                          ];
                          handleReorderDrop(draggedId, fromStatus, status as any, newOrder);
                        }}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{task.title}</div>
                            <div className="text-xs text-gray-500">{task.project?.name ?? '-'}</div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              className="text-gray-600 hover:text-gray-900"
                              title="View"
                              onClick={() => {
                                setSelectedTask(task);
                                setIsViewOpen(true);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              className="text-indigo-600 hover:text-indigo-900"
                              title="Edit"
                              onClick={() => {
                                setSelectedTask(task);
                                setIsEditOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            {isAdmin && (
                              <button
                                className="text-red-600 hover:text-red-900"
                                title="Delete"
                                onClick={() => {
                                  if (window.confirm('Delete this task?')) {
                                    deleteMutation.mutate(task.id);
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <div className="flex -space-x-1 overflow-hidden">
                            {(() => {
                              const displayAssignees = getDisplayAssignees(task);
                              if (displayAssignees.length > 0) {
                                return displayAssignees.map((assignee) => {
                                  const initials = assignee.name
                                    .split(' ')
                                    .map((n) => n[0])
                                    .join('')
                                    .substring(0, 2)
                                    .toUpperCase();
                                  return (
                                    <div
                                      key={assignee.id}
                                      title={assignee.name}
                                      className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-medium text-indigo-800 ring-2 ring-white"
                                    >
                                      {initials}
                                    </div>
                                  );
                                });
                              }
                              return <span className="text-xs text-gray-400">Unassigned</span>;
                            })()}
                          </div>
                          <span className="text-xs text-gray-500">
                            {task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}
                          </span>
                        </div>
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
          disabled={currentPage <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Previous
        </button>
        <div className="text-sm text-gray-600">
          Page {currentPage} of {lastPage}
        </div>
        <button
          className="px-3 py-1 rounded border text-sm disabled:opacity-50"
          disabled={currentPage >= lastPage}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>

      {isViewOpen && selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b flex justify-between items-center flex-shrink-0">
              <h3 className="text-lg font-semibold">Task Details</h3>
              <button onClick={() => { setIsViewOpen(false); setSelectedTask(null); }} className="text-gray-500 hover:text-gray-700">&times;</button>
            </div>
            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 uppercase">Title</label>
                  <p className="mt-1 text-sm text-gray-900 font-medium">{selectedTask.title}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase">Project</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedTask.project?.name || '-'}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase">Assigned Employees</label>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {(() => {
                      const displayAssignees = getDisplayAssignees(selectedTask);
                      if (displayAssignees.length > 0) {
                        return displayAssignees.map((assignee) => (
                          <span
                            key={assignee.id}
                            className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-50 text-xs font-medium text-indigo-700 border border-indigo-100"
                          >
                            {assignee.name}
                          </span>
                        ));
                      }
                      return <p className="text-sm text-gray-900">-</p>;
                    })()}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase">Status</label>
                  <span className={`mt-1 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${selectedTask.status === 'completed' ? 'bg-green-100 text-green-800' : selectedTask.status === 'in_progress' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                    {selectedTask.status}
                  </span>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase">Priority</label>
                  <p className="mt-1 text-sm text-gray-900 capitalize">{selectedTask.priority}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase">Due Date</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedTask.due_date ? new Date(selectedTask.due_date).toLocaleDateString() : '-'}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase">Estimated Hours</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedTask.estimated_hours || '-'}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase">Actual Hours</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedTask.actual_hours || '-'}</p>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 uppercase">Description</label>
                  <p className="mt-1 text-sm text-gray-900 bg-gray-50 p-2 rounded whitespace-pre-wrap">{selectedTask.description || 'No description'}</p>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 uppercase">Notes</label>
                  <p className="mt-1 text-sm text-gray-900 bg-gray-50 p-2 rounded whitespace-pre-wrap">{selectedTask.notes || 'No notes'}</p>
                </div>
              </div>
              <div className="flex items-center justify-end pt-2">
                <button type="button" className="px-4 py-2 rounded bg-gray-100 text-gray-700 hover:bg-gray-200" onClick={() => { setIsViewOpen(false); setSelectedTask(null); }}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b flex justify-between items-center flex-shrink-0">
              <h3 className="text-lg font-semibold">Add Task</h3>
              <button onClick={() => setIsCreateOpen(false)} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
            </div>
            <form
              id="create-task-form"
              className="px-6 py-4 space-y-4 overflow-y-auto flex-1"
              onSubmit={createForm.handleSubmit((values) => {
                const assigneeIds = values.assignee_ids
                  ? values.assignee_ids.map(Number).filter((id) => !isNaN(id))
                  : [];
                const payload = {
                  ...values,
                  estimated_hours: values.estimated_hours ?? undefined,
                  assigned_to: assigneeIds.length > 0 ? assigneeIds[0] : undefined,
                  assignee_ids: assigneeIds,
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
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Employees</label>
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 border rounded bg-white">
                    {userOptions.map((u) => (
                      <label key={u.id} className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-50 p-1 rounded">
                        <input
                          type="checkbox"
                          value={String(u.id)}
                          disabled={!isAdmin && currentUser.id !== u.id}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                          {...createForm.register('assignee_ids')}
                        />
                        <span>{u.name}</span>
                      </label>
                    ))}
                  </div>
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
            </form>
            <div className="px-6 py-3 border-t flex items-center justify-end gap-2 flex-shrink-0">
              <button type="button" className="px-4 py-2 rounded border" onClick={() => setIsCreateOpen(false)}>Cancel</button>
              <button type="submit" form="create-task-form" className="px-4 py-2 rounded bg-indigo-600 text-white">Create</button>
            </div>
          </div>
        </div>
      )}

      {isEditOpen && selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b flex justify-between items-center flex-shrink-0">
              <h3 className="text-lg font-semibold">Edit Task</h3>
              <button onClick={() => { setIsEditOpen(false); setSelectedTask(null); }} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
            </div>
            <form
              id="edit-task-form"
              className="px-6 py-4 space-y-4 overflow-y-auto flex-1"
              onSubmit={editForm.handleSubmit((values) => {
                const assigneeIds = values.assignee_ids
                  ? values.assignee_ids.map(Number).filter((id) => !isNaN(id))
                  : [];
                const payload = {
                  ...values,
                  assigned_to: assigneeIds.length > 0 ? assigneeIds[0] : undefined,
                  assignee_ids: assigneeIds,
                };
                updateMutation.mutate({ id: selectedTask!.id, data: payload });
              })}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Title</label>
                  <input {...editForm.register('title')} disabled={!isAdmin} className="mt-1 block w-full border rounded px-3 py-2 disabled:bg-gray-100 disabled:text-gray-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Project</label>
                  <select {...editForm.register('project_id', { valueAsNumber: true })} disabled={!isAdmin} className="mt-1 block w-full border rounded px-3 py-2 disabled:bg-gray-100 disabled:text-gray-500">
                    {projectOptions.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Employees</label>
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 border rounded bg-white">
                    {userOptions.map((u) => (
                      <label key={u.id} className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-50 p-1 rounded">
                        <input
                          type="checkbox"
                          value={String(u.id)}
                          disabled={!isAdmin}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                          {...editForm.register('assignee_ids')}
                        />
                        <span>{u.name}</span>
                      </label>
                    ))}
                  </div>
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
                  <select {...editForm.register('priority')} disabled={!isAdmin} className="mt-1 block w-full border rounded px-3 py-2 disabled:bg-gray-100 disabled:text-gray-500">
                    {priorityOptions.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Due Date</label>
                  <input {...editForm.register('due_date')} disabled={!isAdmin} type="date" className="mt-1 block w-full border rounded px-3 py-2 disabled:bg-gray-100 disabled:text-gray-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Estimated Hours</label>
                  <input {...editForm.register('estimated_hours', { valueAsNumber: true })} disabled={!isAdmin} type="number" step="1" className="mt-1 block w-full border rounded px-3 py-2 disabled:bg-gray-100 disabled:text-gray-500" />
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
            </form>
            <div className="px-6 py-3 border-t flex items-center justify-end gap-2 flex-shrink-0">
              <button type="button" className="px-4 py-2 rounded border" onClick={() => { setIsEditOpen(false); setSelectedTask(null); }}>Cancel</button>
              <button type="submit" form="edit-task-form" className="px-4 py-2 rounded bg-indigo-600 text-white">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
