import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit, Trash2, UserPlus } from 'lucide-react';
import { usersAPI } from '../api/users';
import { useAuthStore } from '../stores/authStore';
import LoadingSpinner from '../components/LoadingSpinner';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import type { AxiosError } from 'axios';
import type { User } from '../types';

export default function Employees() {
  const { user: currentUser } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const queryClient = useQueryClient();

  const { data: users, isLoading } = useQuery<{ data: User[]; current_page: number; last_page: number }>({
    queryKey: ['users', searchTerm, roleFilter, statusFilter, page],
    queryFn: () => usersAPI.getUsers({
      search: searchTerm,
      role: roleFilter as 'admin' | 'employee' | undefined,
      status: statusFilter as 'active' | 'inactive' | undefined,
      page,
    }),
  });

  const createSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Invalid email'),
    role: z.enum(['admin', 'employee']),
    password: z.string().min(8, 'Minimum 8 characters'),
    password_confirmation: z.string().min(8, 'Minimum 8 characters'),
    phone: z.string().optional(),
    department: z.string().optional(),
    position: z.string().optional(),
    status: z.enum(['active', 'inactive']),
    hire_date: z.string().optional(),
  }).refine((data) => data.password === data.password_confirmation, {
    message: 'Passwords do not match',
    path: ['password_confirmation'],
  });

  const editSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Invalid email'),
    role: z.enum(['admin', 'employee']),
    password: z.string().optional(),
    password_confirmation: z.string().optional(),
    phone: z.string().optional(),
    department: z.string().optional(),
    position: z.string().optional(),
    status: z.enum(['active', 'inactive']),
    hire_date: z.string().optional(),
  }).refine((data) => (data.password ?? '') === (data.password_confirmation ?? ''), {
    message: 'Passwords do not match',
    path: ['password_confirmation'],
  });

  type CreateEmployeeForm = z.infer<typeof createSchema>;
  type EditEmployeeForm = z.infer<typeof editSchema>;
  const createForm = useForm<CreateEmployeeForm>({ resolver: zodResolver(createSchema), defaultValues: { status: 'active', role: 'employee' } });
  const editForm = useForm<EditEmployeeForm>({ resolver: zodResolver(editSchema) });

  const createMutation = useMutation({
    mutationFn: (payload: CreateEmployeeForm) => usersAPI.createUser(payload),
    onSuccess: () => {
      toast.success('Employee created');
      setIsCreateOpen(false);
      createForm.reset();
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: unknown) => {
      const err = error as AxiosError<{ message?: string }>;
      toast.error(err.response?.data?.message ?? 'Failed to create employee');
    }
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: number; data: Partial<EditEmployeeForm> }) => usersAPI.updateUser(payload.id, payload.data),
    onSuccess: () => {
      toast.success('Employee updated');
      setIsEditOpen(false);
      setSelectedUser(null);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: unknown) => {
      const err = error as AxiosError<{ message?: string }>;
      toast.error(err.response?.data?.message ?? 'Failed to update employee');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => usersAPI.deleteUser(id),
    onSuccess: () => {
      toast.success('Employee deleted');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: unknown) => {
      const err = error as AxiosError<{ message?: string }>;
      toast.error(err.response?.data?.message ?? 'Failed to delete employee');
    }
  });

  if (currentUser?.role !== 'admin') {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">You don't have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
        <button onClick={() => setIsCreateOpen(true)} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
          <Plus className="h-4 w-4 mr-2" />
          Add Employee
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search employees..."
                className="pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 w-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <select
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="employee">Employee</option>
            </select>
            <select
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {/* Employees Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Department
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Join Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center">
                    <LoadingSpinner size="md" />
                  </td>
                </tr>
              ) : (users as { data: User[] } | undefined)?.data.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                    No employees found
                  </td>
                </tr>
              ) : (
                (users as { data: User[] } | undefined)?.data.map((employee) => (
                  <tr key={employee.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                            <UserPlus className="h-5 w-5 text-gray-500" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{employee.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {employee.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                        {employee.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {employee.department || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        employee.status === 'active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {employee.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {employee.hire_date ? new Date(employee.hire_date).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          className="text-indigo-600 hover:text-indigo-900"
                          onClick={() => {
                            setSelectedUser(employee);
                            setIsEditOpen(true);
                            editForm.reset({
                              name: employee.name,
                              email: employee.email,
                              role: employee.role,
                              phone: employee.phone ?? '',
                              department: employee.department ?? '',
                              position: employee.position ?? '',
                              status: employee.status,
                              hire_date: employee.hire_date ?? '',
                              password: '',
                              password_confirmation: '',
                            });
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          className="text-red-600 hover:text-red-900"
                          onClick={() => {
                            if (window.confirm('Delete this employee?')) {
                              deleteMutation.mutate(employee.id);
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

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <button
          className="px-3 py-1 rounded border text-sm disabled:opacity-50"
          disabled={!users || (users as { current_page: number }).current_page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Previous
        </button>
        <div className="text-sm text-gray-600">
          Page {(users as { current_page: number } | undefined)?.current_page ?? page} of {(users as { last_page: number } | undefined)?.last_page ?? 1}
        </div>
        <button
          className="px-3 py-1 rounded border text-sm disabled:opacity-50"
          disabled={!users || (users as { current_page: number; last_page: number }).current_page >= (users as { current_page: number; last_page: number }).last_page}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>

      {/* Create Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold">Add Employee</h3>
            </div>
            <form
              className="px-6 py-4 space-y-4"
              onSubmit={createForm.handleSubmit((values) => {
                createMutation.mutate(values);
              })}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input {...createForm.register('name')} className="mt-1 block w-full border rounded px-3 py-2" />
                  {createForm.formState.errors.name && (
                    <p className="text-sm text-red-600">{createForm.formState.errors.name.message as string}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input {...createForm.register('email')} type="email" className="mt-1 block w-full border rounded px-3 py-2" />
                  {createForm.formState.errors.email && (
                    <p className="text-sm text-red-600">{createForm.formState.errors.email.message as string}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Role</label>
                  <select {...createForm.register('role')} className="mt-1 block w-full border rounded px-3 py-2">
                    <option value="admin">Admin</option>
                    <option value="employee">Employee</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Status</label>
                  <select {...createForm.register('status')} className="mt-1 block w-full border rounded px-3 py-2">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Password</label>
                  <input {...createForm.register('password')} type="password" className="mt-1 block w-full border rounded px-3 py-2" />
                  {createForm.formState.errors.password && (
                    <p className="text-sm text-red-600">{createForm.formState.errors.password.message as string}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Confirm Password</label>
                  <input {...createForm.register('password_confirmation')} type="password" className="mt-1 block w-full border rounded px-3 py-2" />
                  {createForm.formState.errors.password_confirmation && (
                    <p className="text-sm text-red-600">{createForm.formState.errors.password_confirmation.message as string}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Department</label>
                  <input {...createForm.register('department')} className="mt-1 block w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Position</label>
                  <input {...createForm.register('position')} className="mt-1 block w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Phone</label>
                  <input {...createForm.register('phone')} className="mt-1 block w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Hire Date</label>
                  <input {...createForm.register('hire_date')} type="date" className="mt-1 block w-full border rounded px-3 py-2" />
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

      {/* Edit Modal */}
      {isEditOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold">Edit Employee</h3>
            </div>
            <form
              className="px-6 py-4 space-y-4"
              onSubmit={editForm.handleSubmit((values) => {
                const payload = values.password
                  ? values
                  : {
                      name: values.name,
                      email: values.email,
                      role: values.role,
                      phone: values.phone,
                      department: values.department,
                      position: values.position,
                      status: values.status,
                      hire_date: values.hire_date,
                    };
                updateMutation.mutate({ id: selectedUser!.id, data: payload });
              })}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input {...editForm.register('name')} className="mt-1 block w-full border rounded px-3 py-2" />
                  {editForm.formState.errors.name && (
                    <p className="text-sm text-red-600">{editForm.formState.errors.name.message as string}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input {...editForm.register('email')} type="email" className="mt-1 block w-full border rounded px-3 py-2" />
                  {editForm.formState.errors.email && (
                    <p className="text-sm text-red-600">{editForm.formState.errors.email.message as string}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Role</label>
                  <select {...editForm.register('role')} className="mt-1 block w-full border rounded px-3 py-2">
                    <option value="admin">Admin</option>
                    <option value="employee">Employee</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Status</label>
                  <select {...editForm.register('status')} className="mt-1 block w-full border rounded px-3 py-2">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">New Password</label>
                  <input {...editForm.register('password')} type="password" className="mt-1 block w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Confirm Password</label>
                  <input {...editForm.register('password_confirmation')} type="password" className="mt-1 block w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Department</label>
                  <input {...editForm.register('department')} className="mt-1 block w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Position</label>
                  <input {...editForm.register('position')} className="mt-1 block w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Phone</label>
                  <input {...editForm.register('phone')} className="mt-1 block w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Hire Date</label>
                  <input {...editForm.register('hire_date')} type="date" className="mt-1 block w-full border rounded px-3 py-2" />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" className="px-4 py-2 rounded border" onClick={() => { setIsEditOpen(false); setSelectedUser(null); }}>Cancel</button>
                <button type="submit" className="px-4 py-2 rounded bg-indigo-600 text-white">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
