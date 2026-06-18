import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Video, Calendar, Clock, Loader2, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { meetingsAPI } from '../api/meetings';
import { usersAPI } from '../api/users';
import { teamAvailabilityAPI } from '../api/teamAvailability';
import { useAuthStore } from '../stores/authStore';
import { getEcho } from '../lib/echo';
import type { Meeting } from '../types/meetings';
import type { User } from '../types';
import MeetingCard from '../components/MeetingCard';

export default function Meetings() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [meetings, setMeetings] = useState<{
    upcoming: Meeting[];
    live: Meeting[];
    completed: Meeting[];
    cancelled: Meeting[];
  }>({
    upcoming: [],
    live: [],
    completed: [],
    cancelled: [],
  });

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'team' | 'one_on_one' | 'department'>('team');
  const [scheduledAt, setScheduledAt] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [selectedParticipants, setSelectedParticipants] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'live' | 'completed'>('upcoming');
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const startImmediatelyRef = useRef(false);

  const participantIds = useMemo(() => users.map(u => u.id), [users]);
  const allSelected = participantIds.length > 0 && selectedParticipants.length === participantIds.length;
  const someSelected = selectedParticipants.length > 0 && selectedParticipants.length < participantIds.length;

  const getDefaultMeetingTitle = () => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `Daily meeting ${day}-${month}-${year}`;
  };

  const fetchMeetings = async () => {
    try {
      const res = await meetingsAPI.getMeetings();
      if (res.success) {
        setMeetings(res.data);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to fetch meetings');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      let onlineIds: Set<number> | null = null;
      try {
        const presRes = await teamAvailabilityAPI.getTeamAvailability();
        if (presRes.success) {
          onlineIds = new Set(
            presRes.data
              .filter((p) => p.status !== 'offline')
              .map((p) => p.user_id)
          );
        }
      } catch (e) {
        void e;
      }

      const res = await usersAPI.getUsers({ status: 'active' });
      const otherUsers = res.data.filter((u: User) => u.id !== user?.id);
      const filtered = onlineIds ? otherUsers.filter((u) => onlineIds!.has(u.id)) : otherUsers;
      setUsers(filtered);
    } catch (err) {
      void err;
    }
  };

  useEffect(() => {
    fetchMeetings();
    fetchUsers();

    if (user?.id) {
      const echo = getEcho();
      const channel = echo.private(`App.Models.User.${user.id}`);
      
      channel
        .listen('.meeting.created', (e: { meeting: Meeting }) => {
          toast.info(`New meeting scheduled: "${e.meeting.title}"`);
          fetchMeetings();
        })
        .listen('.meeting.started', (e: { meeting: Meeting }) => {
          toast.success(`Meeting "${e.meeting.title}" is now LIVE!`);
          fetchMeetings();
        })
        .listen('.meeting.ended', (e: { meeting: Meeting }) => {
          toast.info(`Meeting "${e.meeting.title}" has ended`);
          fetchMeetings();
        })
        .listen('.meeting.reminder', (e: { meeting: Meeting; time_string: string }) => {
          toast.info(`Reminder: "${e.meeting.title}" ${e.time_string}`);
          fetchMeetings();
        });

      return () => {
        channel.stopListening('.meeting.created');
        channel.stopListening('.meeting.started');
        channel.stopListening('.meeting.ended');
        channel.stopListening('.meeting.reminder');
      };
    }
  }, [user?.id]);

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = someSelected;
  }, [someSelected, users.length, selectedParticipants.length]);

  useEffect(() => {
    if (showCreateModal && !editingMeeting && !title.trim()) {
      setTitle(getDefaultMeetingTitle());
    }
  }, [showCreateModal, editingMeeting]);

  const handleRespond = async (id: number, status: 'accepted' | 'declined') => {
    try {
      const res = await meetingsAPI.respondToInvitation(id, status);
      if (res.success) {
        toast.success(`Invitation ${status}`);
        fetchMeetings();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update response');
    }
  };

  const handleStart = async (id: number) => {
    try {
      const res = await meetingsAPI.startMeeting(id);
      if (res.success) {
        toast.success('Meeting started!');
        navigate(`/meeting-room/${id}`);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to start meeting');
    }
  };

  const handleEnd = async (id: number) => {
    try {
      const res = await meetingsAPI.endMeeting(id);
      if (res.success) {
        toast.success('Meeting ended');
        fetchMeetings();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to end meeting');
    }
  };

  const handleJoin = (id: number) => {
    navigate(`/meeting-room/${id}`);
  };

  const handleCancel = async (id: number) => {
    if (!window.confirm('Are you sure you want to cancel this meeting?')) return;
    try {
      const res = await meetingsAPI.cancelMeeting(id);
      if (res.success) {
        toast.success('Meeting cancelled');
        fetchMeetings();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to cancel meeting');
    }
  };

  const handleOpenEdit = (meeting: Meeting) => {
    setEditingMeeting(meeting);
    setTitle(meeting.title);
    setDescription(meeting.description || '');
    setType(meeting.type);
    
    // Format scheduled_at date string for input type="datetime-local" (YYYY-MM-DDThh:mm)
    const d = new Date(meeting.scheduled_at);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    setScheduledAt(`${year}-${month}-${day}T${hours}:${minutes}`);
    
    setDurationMinutes(meeting.duration_minutes);
    setSelectedParticipants(meeting.participants.filter(p => p.pivot.role !== 'host').map(p => p.id));
    setShowCreateModal(true);
  };

  const handleCloseModal = () => {
    setShowCreateModal(false);
    setEditingMeeting(null);
    setTitle('');
    setDescription('');
    setType('team');
    setScheduledAt('');
    setDurationMinutes(30);
    setSelectedParticipants([]);
    startImmediatelyRef.current = false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const nowStr = `${year}-${month}-${day}T${hours}:${minutes}`;

    const scheduledTime = startImmediatelyRef.current ? nowStr : scheduledAt;

    if (!title.trim() || !scheduledTime || selectedParticipants.length === 0) {
      toast.error('Please fill in all required fields and select at least one participant.');
      return;
    }

    setSubmitting(true);
    const data = {
      title,
      description,
      type,
      scheduled_at: scheduledTime,
      duration_minutes: durationMinutes,
      participants: selectedParticipants,
    };

    try {
      if (editingMeeting) {
        const res = await meetingsAPI.updateMeeting(editingMeeting.id, data);
        if (res.success) {
          toast.success('Meeting updated successfully!');
          handleCloseModal();
          fetchMeetings();
        }
      } else {
        const res = await meetingsAPI.createMeeting(data);
        if (res.success) {
          const newMeeting = res.data;
          if (startImmediatelyRef.current) {
            toast.success('Meeting created, starting now...');
            const startRes = await meetingsAPI.startMeeting(newMeeting.id);
            if (startRes.success) {
              toast.success('Meeting started!');
              handleCloseModal();
              navigate(`/meeting-room/${newMeeting.id}`);
            } else {
              toast.error('Meeting created, but failed to start room.');
              handleCloseModal();
              fetchMeetings();
            }
          } else {
            toast.success('Meeting scheduled successfully!');
            handleCloseModal();
            fetchMeetings();
          }
        }
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to schedule meeting');
    } finally {
      setSubmitting(false);
      startImmediatelyRef.current = false;
    }
  };

  const handleToggleParticipant = (userId: number) => {
    setSelectedParticipants(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleToggleAllParticipants = () => {
    setSelectedParticipants(prev => {
      if (participantIds.length === 0) return prev;
      if (prev.length === participantIds.length) return [];
      return [...participantIds];
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
        <span className="text-gray-500 font-medium">Loading meetings...</span>
      </div>
    );
  }

  const currentTabMeetings = 
    activeTab === 'upcoming' 
      ? [...meetings.upcoming, ...meetings.cancelled] 
      : activeTab === 'live' 
        ? meetings.live 
        : meetings.completed;

  return (
    <div className="space-y-6">
      {/* Upper header */}
      {/* Upper header */}
      <div className="relative overflow-hidden bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 rounded-3xl p-8 shadow-2xl border border-white/10">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-inner">
              <Video className="w-8 h-8 text-white drop-shadow-md" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-white tracking-tight drop-shadow-sm">Meetings & Rooms</h1>
              <p className="text-indigo-100 font-medium mt-1.5 text-sm md:text-base">Collaborate with voice, video, and chat seamlessly in real-time.</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-6 py-3.5 bg-white text-indigo-600 hover:bg-indigo-50 rounded-2xl font-extrabold shadow-xl hover:shadow-2xl transition-all transform hover:-translate-y-1"
          >
            <Plus className="w-5 h-5 stroke-[3]" />
            Schedule Meeting
          </button>
        </div>
      </div>

      {/* Tabs */}
      {/* Tabs */}
      <div className="flex bg-gray-100 dark:bg-gray-800/60 p-1.5 rounded-2xl gap-1 w-fit border border-gray-200 dark:border-gray-700/50 shadow-inner">
        <button
          onClick={() => setActiveTab('upcoming')}
          className={`px-5 py-2.5 font-bold text-sm rounded-xl transition-all flex items-center gap-2.5 ${
            activeTab === 'upcoming'
              ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          Upcoming
          <span className={`px-2 py-0.5 text-[11px] rounded-full font-extrabold transition-colors ${activeTab === 'upcoming' ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400' : 'bg-gray-200 dark:bg-gray-800 text-gray-500'}`}>
            {meetings.upcoming.length + meetings.cancelled.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('live')}
          className={`px-5 py-2.5 font-bold text-sm rounded-xl transition-all flex items-center gap-2.5 ${
            activeTab === 'live'
              ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          Live Rooms
          {meetings.live.length > 0 && (
            <span className="px-2 py-0.5 text-[11px] bg-rose-500 text-white rounded-full font-extrabold animate-pulse shadow-sm">
              {meetings.live.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('completed')}
          className={`px-5 py-2.5 font-bold text-sm rounded-xl transition-all flex items-center gap-2.5 ${
            activeTab === 'completed'
              ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          Completed
          <span className={`px-2 py-0.5 text-[11px] rounded-full font-extrabold transition-colors ${activeTab === 'completed' ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400' : 'bg-gray-200 dark:bg-gray-800 text-gray-500'}`}>
            {meetings.completed.length}
          </span>
        </button>
      </div>

      {/* Grid of Meetings */}
      {currentTabMeetings.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-150 dark:border-gray-800 p-12 text-center flex flex-col items-center justify-center">
          <Calendar className="w-12 h-12 text-gray-300 dark:text-gray-700 mb-3" />
          <h3 className="font-bold text-gray-800 dark:text-white text-lg">No meetings found</h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm max-w-sm mt-1">
            {activeTab === 'upcoming' 
              ? 'Schedule a new meeting room to invite other team members.' 
              : activeTab === 'live' 
                ? 'No meetings are currently live. Hosts can start a scheduled meeting room.'
                : 'Your completed meeting rooms will appear here.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {currentTabMeetings.map(meeting => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              onRespond={handleRespond}
              onStart={handleStart}
              onEnd={handleEnd}
              onJoin={handleJoin}
              onCancel={handleCancel}
              onEdit={handleOpenEdit}
            />
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 dark:bg-black/60 backdrop-blur-md overflow-y-auto transition-all">
          <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border border-white/20 dark:border-gray-700/50 rounded-[2rem] max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col transform transition-all">
            <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-transparent">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="font-black text-gray-900 dark:text-white text-xl tracking-tight">
                  {editingMeeting ? 'Edit Scheduled Meeting' : 'Schedule New Meeting'}
                </h3>
              </div>
              <button
                onClick={handleCloseModal}
                className="p-2 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-6 flex-1">
              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">
                  Meeting Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g., Weekly Project Sync"
                  className="w-full px-5 py-3.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white dark:focus:bg-gray-800 transition-all font-medium placeholder-gray-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Agenda details, links, or notes..."
                  rows={3}
                  className="w-full px-5 py-3.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white dark:focus:bg-gray-800 transition-all font-medium placeholder-gray-400 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">
                    Meeting Type
                  </label>
                  <select
                    value={type}
                    onChange={e => setType(e.target.value as any)}
                    className="w-full px-5 py-3.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white dark:focus:bg-gray-800 transition-all font-medium appearance-none"
                  >
                    <option value="team">Team Meeting</option>
                    <option value="one_on_one">1-on-1 Sync</option>
                    <option value="department">Department Sync</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">
                    Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    min={5}
                    required
                    value={durationMinutes}
                    onChange={e => setDurationMinutes(Number(e.target.value))}
                    className="w-full px-5 py-3.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white dark:focus:bg-gray-800 transition-all font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">
                  Scheduled Time <span className="text-rose-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  required
                  value={scheduledAt}
                  onChange={e => setScheduledAt(e.target.value)}
                  className="w-full px-5 py-3.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white dark:focus:bg-gray-800 transition-all font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2 flex justify-between items-center">
                  <span>Invite Team Members <span className="text-rose-500">*</span></span>
                  <span className="text-indigo-500 font-bold bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">
                    {selectedParticipants.length} selected
                  </span>
                </label>
                <div className="border border-gray-200 dark:border-gray-700 rounded-2xl max-h-48 overflow-y-auto p-2 space-y-1 bg-gray-50/30 dark:bg-gray-800/30">
                  {users.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-sm text-gray-400 font-medium">No active team members available</p>
                    </div>
                  ) : (
                    <>
                      <label className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border select-none bg-white dark:bg-gray-800 border-transparent hover:border-gray-200 dark:hover:border-gray-700 shadow-sm">
                        <div className="relative flex items-center justify-center">
                          <input
                            ref={selectAllRef}
                            type="checkbox"
                            checked={allSelected}
                            onChange={handleToggleAllParticipants}
                            className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 transition-all cursor-pointer"
                          />
                        </div>
                        <div className="flex items-center gap-3 flex-1">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/50 dark:to-purple-900/50 flex items-center justify-center font-bold text-indigo-700 dark:text-indigo-300 text-xs shadow-sm">
                            ALL
                          </div>
                          <div>
                            <p className="font-bold text-sm text-gray-900 dark:text-white leading-tight">Select all</p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium mt-0.5">Invite everyone</p>
                          </div>
                        </div>
                      </label>
                      {users.map(u => (
                        <label
                          key={u.id}
                          className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border select-none ${
                            selectedParticipants.includes(u.id) 
                              ? 'bg-indigo-50/50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800/50' 
                              : 'bg-white dark:bg-gray-800 border-transparent hover:border-gray-200 dark:hover:border-gray-700 shadow-sm'
                          }`}
                        >
                          <div className="relative flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={selectedParticipants.includes(u.id)}
                              onChange={() => handleToggleParticipant(u.id)}
                              className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 transition-all cursor-pointer"
                            />
                          </div>
                          <div className="flex items-center gap-3 flex-1">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/50 dark:to-purple-900/50 flex items-center justify-center font-bold text-indigo-700 dark:text-indigo-300 text-xs shadow-sm">
                              {u.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-bold text-sm text-gray-900 dark:text-white leading-tight">{u.name}</p>
                              <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium mt-0.5 capitalize">{u.role} {u.department ? `• ${u.department}` : ''}</p>
                            </div>
                          </div>
                        </label>
                      ))}
                    </>
                  )}
                </div>
              </div>

              <div className="pt-6 border-t border-gray-150 dark:border-gray-800/60 flex justify-end gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-6 py-3 text-sm font-bold bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl text-gray-700 dark:text-gray-300 transition-colors"
                >
                  Cancel
                </button>
                {!editingMeeting && (
                  <button
                    type="submit"
                    disabled={submitting}
                    onClick={() => { startImmediatelyRef.current = true; }}
                    className="flex items-center justify-center gap-2 px-6 py-3 text-sm font-black text-white bg-rose-500 hover:bg-rose-600 rounded-xl shadow-lg shadow-rose-500/30 hover:shadow-rose-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5"
                  >
                    {submitting && startImmediatelyRef.current && <Loader2 className="w-4 h-4 animate-spin" />}
                    Start Now
                  </button>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  onClick={() => { startImmediatelyRef.current = false; }}
                  className="flex items-center justify-center gap-2 px-8 py-3 text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5"
                >
                  {submitting && !startImmediatelyRef.current && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingMeeting ? 'Save Changes' : 'Schedule Meeting'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
