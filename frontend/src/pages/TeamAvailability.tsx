import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTeamPresence } from '../hooks/useTeamPresence';
import { projectsAPI } from '../api/projects';
import { teamAvailabilityAPI, type IdleHistoryEntry } from '../api/teamAvailability';
import { usersAPI } from '../api/users';
import { chatAPI } from '../api/chat';
import { meetingsAPI } from '../api/meetings';
import { voiceAPI } from '../api/voice';
import { notificationsAPI } from '../api/notifications';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useChat } from '../hooks/useChat';
import type { Project, User } from '../types';
import type { PresenceFilters, UserPresence } from '../types/presence';
import { toast } from 'sonner';
import { 
  Search, 
  Users, 
  Briefcase, 
  Clock, 
  Wifi, 
  WifiOff, 
  MessageSquare, 
  RefreshCw, 
  Pause, 
  UserCheck,
  Video,
  Megaphone,
  CalendarPlus,
  ShieldAlert,
  X,
  Send,
  Building
} from 'lucide-react';

type SimplePeerInstance = import('simple-peer').Instance;
type SimplePeerSignalData = import('simple-peer').SignalData;
type SimplePeerConstructor = typeof import('simple-peer').default;

// Live counter sub-component for performance optimization
function LiveTrackingCounter({ startedAt }: { startedAt: string }) {
  const [time, setTime] = useState('00h 00m 00s');

  useEffect(() => {
    const calculateElapsed = () => {
      const start = new Date(startedAt).getTime();
      const now = Date.now();
      const diff = Math.max(0, now - start);
      
      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      
      const pad = (num: number) => String(num).padStart(2, '0');
      setTime(`${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`);
    };

    calculateElapsed();
    const interval = setInterval(calculateElapsed, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return <span className="font-mono text-sm font-semibold">{time}</span>;
}

// Side-over Chat Drawer component
function ChatDrawer({ isOpen, userId, userName, onClose }: { isOpen: boolean; userId: number | null; userName: string; onClose: () => void }) {
  const { conversations, activeConversationId, messages, typingUsers, fetchConversations, setActiveConversationId, fetchMessages, addMessage } = useChatStore();
  const { user: currentUser } = useAuthStore();
  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const isTypingRef = useRef(false);

  // Subscribe to conversation WebSocket
  useChat(activeConversationId);

  // Load conversation on userId change
  useEffect(() => {
    if (!isOpen || !userId) return;

    const setupChat = async () => {
      await fetchConversations();
      
      const activeConv = useChatStore.getState().conversations.find(
        (c) => c.type === 'direct' && c.participants.some((p) => p.id === userId)
      );

      if (activeConv) {
        setActiveConversationId(activeConv.id);
        fetchMessages(activeConv.id);
      } else {
        // Create new direct conversation
        try {
          const res = await chatAPI.createConversation({
            type: 'direct',
            recipient_id: userId,
          });
          if (res.success) {
            await fetchConversations();
            setActiveConversationId(res.conversation_id);
            fetchMessages(res.conversation_id);
          }
        } catch (e) {
          toast.error('Failed to start chat session');
          void e;
        }
      }
    };

    setupChat();
  }, [isOpen, userId, fetchConversations, setActiveConversationId, fetchMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers, isOpen]);

  if (!isOpen || !userId) return null;

  const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageText(e.target.value);
    if (!activeConversationId) return;

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      chatAPI.sendTyping(activeConversationId, true).catch(() => void 0);
    }

    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = window.setTimeout(() => {
      isTypingRef.current = false;
      chatAPI.sendTyping(activeConversationId, false).catch(() => void 0);
    }, 2000);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !activeConversationId) return;

    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
      isTypingRef.current = false;
      chatAPI.sendTyping(activeConversationId, false).catch(() => void 0);
    }

    const text = messageText;
    setMessageText('');

    try {
      const res = await chatAPI.sendMessage(activeConversationId, text);
      if (res.success) {
        addMessage(res.data);
      }
    } catch (e) {
      toast.error('Message failed to send');
      void e;
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 w-full max-w-sm h-[500px] max-h-[80vh] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col transform transition-transform duration-300 animate-slide-in overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
            {userName}
          </h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">Direct Chat</p>
        </div>
        <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50 dark:bg-gray-900/10">
        {messages.map((msg) => {
          const isSelf = msg.sender_id === currentUser?.id;
          return (
            <div key={msg.id} className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm text-sm ${
                isSelf 
                  ? 'bg-blue-600 text-white rounded-tr-none' 
                  : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 border border-gray-100 dark:border-gray-600 rounded-tl-none'
              }`}>
                <p className="leading-relaxed break-words">{msg.body}</p>
                <span className={`text-[10px] block text-right mt-1.5 font-medium ${isSelf ? 'text-blue-100' : 'text-gray-400 dark:text-gray-400'}`}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          );
        })}
        {activeConversationId && typingUsers[activeConversationId]?.length > 0 && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-gray-700 text-gray-400 dark:text-gray-300 text-xs rounded-full px-4 py-1.5 border border-gray-100 dark:border-gray-600 animate-pulse">
              typing...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message input */}
      <form onSubmit={handleSend} className="p-3 border-t border-gray-100 dark:border-gray-700 flex items-center gap-2">
        <input
          type="text"
          value={messageText}
          onChange={handleMessageChange}
          placeholder="Type a message..."
          className="flex-1 px-4 py-2.5 text-sm border border-gray-300 dark:border-gray-700 rounded-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          className="p-2.5 rounded-full bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 transition flex-shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}

// Removed LiveViewModal since we will inline the video in the card

// Meeting Scheduler Modal component
function MeetingInviteModal({ isOpen, targetUserId, onClose }: { isOpen: boolean; targetUserId: number | null; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'team' | 'one_on_one' | 'department'>('one_on_one');
  const [scheduledAt, setScheduledAt] = useState('');
  const [duration, setDuration] = useState(30);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedParticipants, setSelectedParticipants] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    // Load active users
    usersAPI.getUsers({ status: 'active' })
      .then((res) => {
        setUsers(res.data);
        if (targetUserId) {
          setSelectedParticipants([targetUserId]);
        }
      })
      .catch(() => void 0);
  }, [isOpen, targetUserId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !scheduledAt || selectedParticipants.length === 0) {
      toast.error('Please fill out all required fields and select at least one participant');
      return;
    }

    setLoading(true);
    try {
      const res = await meetingsAPI.createMeeting({
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        scheduled_at: new Date(scheduledAt).toISOString(),
        duration_minutes: duration,
        participants: selectedParticipants,
      });

      if (res.success) {
        toast.success('Meeting scheduled successfully!');
        onClose();
        // Reset states
        setTitle('');
        setDescription('');
        setType('one_on_one');
        setScheduledAt('');
        setDuration(30);
        setSelectedParticipants([]);
      }
    } catch (err) {
      toast.error('Failed to schedule meeting');
      void err;
    } finally {
      setLoading(false);
    }
  };

  const toggleParticipant = (userId: number) => {
    setSelectedParticipants((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-900/50">
          <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <CalendarPlus className="w-5 h-5 text-blue-500" />
            Invite to Meeting
          </h3>
          <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Daily Standup"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe meeting agenda..."
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Meeting Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="one_on_one">One-on-One</option>
                <option value="team">Team Meeting</option>
                <option value="department">Department</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Duration (minutes)</label>
              <input
                type="number"
                min={5}
                required
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Date & Time *</label>
            <input
              type="datetime-local"
              required
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Invite Participants *</label>
            <div className="border border-gray-250 dark:border-gray-700 rounded-xl p-3 bg-gray-50 dark:bg-gray-900/30 max-h-[160px] overflow-y-auto space-y-2">
              {users.map((u) => (
                <label key={u.id} className="flex items-center gap-2.5 py-1 px-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedParticipants.includes(u.id)}
                    onChange={() => toggleParticipant(u.id)}
                    className="w-4 h-4 rounded text-blue-600 border-gray-300 dark:border-gray-750 focus:ring-blue-500"
                  />
                  <div className="leading-tight">
                    <span className="text-sm font-semibold text-gray-850 dark:text-white">{u.name}</span>
                    <span className="text-[10px] text-gray-400 block">{u.department} • {u.position}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-650 text-gray-750 dark:text-gray-300 font-semibold text-sm rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-blue-600 text-white font-semibold text-sm rounded-xl hover:bg-blue-700 transition disabled:opacity-50"
            >
              {loading ? 'Sending Invites...' : 'Schedule & Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Broadcast Announcement Modal component
function BroadcastModal({ isOpen, selectedIds, presences, onClose }: { isOpen: boolean; selectedIds: number[]; presences: UserPresence[]; onClose: () => void }) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      toast.error('Please enter announcement message');
      return;
    }

    setLoading(true);
    try {
      await notificationsAPI.broadcastNotification({
        message: message.trim(),
        user_ids: selectedIds.length > 0 ? selectedIds : undefined,
      });

      toast.success('Broadcast sent successfully to selected team members!');
      setMessage('');
      onClose();
    } catch (err) {
      toast.error('Failed to send broadcast announcement');
      void err;
    } finally {
      setLoading(false);
    }
  };

  const targetText = selectedIds.length > 0 
    ? `Selected (${selectedIds.length} members)` 
    : 'All Active Team Members';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 w-full max-w-md overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-900/50">
          <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-blue-500 animate-bounce" />
            Send Broadcast Announcement
          </h3>
          <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleBroadcast} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Target Audience</label>
            <div className="px-3 py-2 bg-blue-50/50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-semibold border border-blue-100/50 dark:border-blue-900/10">
              {targetText}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Broadcast Message *</label>
            <textarea
              required
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type announcement message here..."
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-650 text-gray-750 dark:text-gray-300 font-semibold text-sm rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-blue-600 text-white font-semibold text-sm rounded-xl hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-1.5"
            >
              <Megaphone className="w-4 h-4" />
              {loading ? 'Broadcasting...' : 'Broadcast'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// MAIN TEAM CENTER COMPONENT
export default function TeamAvailability() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [filters, setFilters] = useState<PresenceFilters>({
    status: '',
    project_id: '',
    department: '',
    search: '',
  });

  const { presences, loading, error, refetch } = useTeamPresence(filters);
  const visiblePresences = useMemo(() => {
    const myId = currentUser?.id;
    if (!myId) return presences;
    return presences.filter(p => p.user_id !== myId);
  }, [presences, currentUser?.id]);

  // Dynamic SimplePeer loader
  const [SimplePeer, setSimplePeer] = useState<SimplePeerConstructor | null>(null);
  useEffect(() => {
    import('simple-peer').then((module) => {
      setSimplePeer(() => module.default);
    });
  }, []);

  // Modal and drawer trigger states
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [activeChatUserId, setActiveChatUserId] = useState<number | null>(null);
  const [activeChatUserName, setActiveChatUserName] = useState('');
  const [isChatDrawerOpen, setIsChatDrawerOpen] = useState(false);

  const [activeLiveUserIds, setActiveLiveUserIds] = useState<number[]>([]);
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);
  const [meetingTargetUserId, setMeetingTargetUserId] = useState<number | null>(null);

  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
  const [idleHistoryUserId, setIdleHistoryUserId] = useState<number | null>(null);
  const [idleHistoryUserName, setIdleHistoryUserName] = useState('');
  const [idleHistory, setIdleHistory] = useState<IdleHistoryEntry[] | null>(null);
  const [idleHistoryLoading, setIdleHistoryLoading] = useState(false);

  const liveVideosRef = useRef<Record<number, HTMLVideoElement | null>>({});
  const liveStreamsRef = useRef<Record<number, MediaStream | null>>({});
  const livePeersRef = useRef<Record<number, SimplePeerInstance | null>>({});
  const liveLastSignalRef = useRef<Record<number, string | null>>({});
  const liveConnectedRef = useRef<Record<number, boolean>>({});
  const liveShouldBeLiveRef = useRef<Record<number, boolean>>({});
  const prevLiveUserIdsRef = useRef<number[]>([]);
  const keepAliveIntervalRef = useRef<number | null>(null);
  const signalIntervalRef = useRef<number | null>(null);
  const signalLockRef = useRef<boolean>(false);

  useEffect(() => {
    const ids = new Set(visiblePresences.map(p => p.user_id));
    setSelectedUserIds((prev) => prev.filter(id => ids.has(id)));
  }, [visiblePresences]);

  // Load active projects for filter dropdown
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const data = await projectsAPI.getActiveProjects();
        setProjects(data);
      } catch (e) {
        void e;
      }
    };
    loadProjects();
  }, []);

  const startLiveView = async (userId: number) => {
    if (!userId || !SimplePeer) return;
    liveShouldBeLiveRef.current[userId] = true;

    try {
      const existing = livePeersRef.current[userId];
      if (existing) {
        try { existing.destroy(); } catch (e) { void e; }
        livePeersRef.current[userId] = null;
      }
      liveConnectedRef.current[userId] = false;

      // Ensure we trigger live mode on backend
      await usersAPI.triggerLive(userId);

      const getIceServers = async () => {
        try {
          const res = await voiceAPI.getIceServers();
          if (res.success && Array.isArray(res.iceServers)) {
            return res.iceServers as unknown as RTCIceServer[];
          }
        } catch (err) {
          void err;
        }
        
        // Fallback to basic STUN if backend fetch fails
        return [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ];
      };

      const iceServersConfig = await getIceServers();

      const p = new SimplePeer({
        initiator: false,
        trickle: true,
        config: { iceServers: iceServersConfig }
      });
      livePeersRef.current[userId] = p;

      p.on('signal', async (data: SimplePeerSignalData) => {
        const sanitizeSdp = (sdp: string) => {
          const lines = sdp.split(/\r\n|\n/);
          const filtered = lines.filter((l) => !l.startsWith('a=max-message-size:'));
          const rebuilt = filtered.join('\r\n').trim();
          return rebuilt ? `${rebuilt}\r\n` : rebuilt;
        };

        if ((data as { type?: string }).type === 'answer') {
          const sdp = (data as unknown as { sdp?: unknown }).sdp;
          const payload = { ...(data as unknown as Record<string, unknown>) };
          if (typeof sdp === 'string') payload.sdp = sanitizeSdp(sdp);
          await usersAPI.signal(userId, { type: 'answer', sdp: payload });
        } else if ((data as { type?: string }).type === 'candidate') {
          await usersAPI.signal(userId, { type: 'candidate', candidate: data as unknown as Record<string, unknown> });
        } else {
          await usersAPI.signal(userId, { type: 'answer', sdp: data as unknown as Record<string, unknown> });
        }
      });

      p.on('connect', () => {
        liveConnectedRef.current[userId] = true;
      });

      p.on('stream', (stream: MediaStream) => {
        liveStreamsRef.current[userId] = stream;
        const el = liveVideosRef.current[userId];
        if (el) {
          el.srcObject = stream;
          el.play().catch(() => {});
        }
      });

      p.on('error', (err: unknown) => {
        void err;
      });

      p.on('close', () => {
        liveConnectedRef.current[userId] = false;
        if (liveShouldBeLiveRef.current[userId]) {
          setTimeout(() => {
            if (liveShouldBeLiveRef.current[userId]) startLiveView(userId);
          }, 1000);
        }
      });

    } catch (error) {
      void error;
      toast.error('Failed to start Live View');
    }
  };

  const stopLiveView = async (userId: number) => {
    liveShouldBeLiveRef.current[userId] = false;
    usersAPI.stopLive(userId).catch(() => {});

    const p = livePeersRef.current[userId];
    if (p) {
      try { p.destroy(); } catch (e) { void e; }
      livePeersRef.current[userId] = null;
    }
    liveConnectedRef.current[userId] = false;
    liveLastSignalRef.current[userId] = null;

    const el = liveVideosRef.current[userId];
    if (el) el.srcObject = null;
    liveStreamsRef.current[userId] = null;
  };

  const stopAllLiveViews = async (updateState: boolean = true) => {
    const ids = Object.keys(livePeersRef.current).map((k) => Number(k)).filter((n) => Number.isFinite(n));
    for (const id of ids) {
      await stopLiveView(id);
    }
    if (updateState) setActiveLiveUserIds([]);
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCounterFilter = (statusVal: string) => {
    setFilters(prev => ({
      ...prev,
      status: statusVal,
    }));
  };

  const clearFilters = () => {
    setFilters({
      status: '',
      project_id: '',
      department: '',
      search: '',
    });
    setSelectedUserIds([]);
  };

  const toggleSelectUserCard = (userId: number) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const handleChatClick = (userId: number, userName: string) => {
    setActiveChatUserId(userId);
    setActiveChatUserName(userName);
    setIsChatDrawerOpen(true);
  };

  useEffect(() => {
    const prev = new Set(prevLiveUserIdsRef.current);
    const next = new Set(activeLiveUserIds);
    for (const id of prev) {
      if (!next.has(id)) {
        stopLiveView(id);
      }
    }
    prevLiveUserIdsRef.current = activeLiveUserIds;
  }, [activeLiveUserIds]);

  useEffect(() => {
    if (keepAliveIntervalRef.current) {
      window.clearInterval(keepAliveIntervalRef.current);
      keepAliveIntervalRef.current = null;
    }
    if (signalIntervalRef.current) {
      window.clearInterval(signalIntervalRef.current);
      signalIntervalRef.current = null;
    }

    if (!SimplePeer || activeLiveUserIds.length === 0) return;

    keepAliveIntervalRef.current = window.setInterval(() => {
      for (const id of activeLiveUserIds) {
        usersAPI.triggerLive(id).catch(() => {
          setActiveLiveUserIds((prev) => prev.filter((x) => x !== id));
        });
      }
    }, 45000);

    signalIntervalRef.current = window.setInterval(async () => {
      if (signalLockRef.current) return;
      signalLockRef.current = true;
      try {
        const sanitizeSdp = (sdp: string) => {
          const lines = sdp.split(/\r\n|\n/);
          const filtered = lines.filter((l) => !l.startsWith('a=max-message-size:'));
          const rebuilt = filtered.join('\r\n').trim();
          return rebuilt ? `${rebuilt}\r\n` : rebuilt;
        };

        const normalizeOffer = (input: unknown): SimplePeerSignalData | null => {
          if (!input) return null;
          if (typeof input === 'string') {
            const trimmed = input.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
              try {
                return JSON.parse(trimmed) as SimplePeerSignalData;
              } catch {
                return { type: 'offer', sdp: trimmed } as SimplePeerSignalData;
              }
            }
            return { type: 'offer', sdp: trimmed } as SimplePeerSignalData;
          }
          if (typeof input === 'object') {
            const obj = input as Record<string, unknown>;
            if (typeof obj.type === 'string' && (typeof obj.sdp === 'string' || typeof obj.candidate === 'string' || typeof obj.candidate === 'object')) {
              return obj as unknown as SimplePeerSignalData;
            }
            if (typeof obj.sdp === 'string') {
              return { type: 'offer', sdp: obj.sdp } as SimplePeerSignalData;
            }
          }
          return null;
        };

        const normalizeCandidate = (input: unknown): SimplePeerSignalData | null => {
          if (!input) return null;
          if (typeof input === 'string') {
            try {
              const parsed = JSON.parse(input) as unknown;
              return normalizeCandidate(parsed);
            } catch {
              return null;
            }
          }
          if (typeof input === 'object') {
            const obj = input as Record<string, unknown>;
            if (typeof obj.type === 'string') return obj as unknown as SimplePeerSignalData;
            if (typeof obj.candidate === 'string') return { type: 'candidate', candidate: obj.candidate } as unknown as SimplePeerSignalData;
            return { type: 'candidate', candidate: obj as unknown as RTCIceCandidateInit } as unknown as SimplePeerSignalData;
          }
          return null;
        };

        for (const id of activeLiveUserIds) {
          const peer = livePeersRef.current[id];
          if (!peer) continue;

          try {
            const offerData = await usersAPI.getSignal(id, 'offer');
            if (offerData) {
              const normalized = normalizeOffer(offerData);
              const cleanedSdp =
                normalized && typeof (normalized as unknown as { sdp?: unknown }).sdp === 'string'
                  ? sanitizeSdp((normalized as unknown as { sdp: string }).sdp)
                  : null;
              const dedupeKey = cleanedSdp ?? JSON.stringify(normalized);

              if (normalized && dedupeKey && dedupeKey !== liveLastSignalRef.current[id]) {
                liveLastSignalRef.current[id] = dedupeKey;
                if (liveConnectedRef.current[id]) {
                  startLiveView(id);
                } else {
                  const toSignal =
                    cleanedSdp && typeof (normalized as unknown as { sdp?: unknown }).sdp === 'string'
                      ? ({ ...(normalized as unknown as Record<string, unknown>), sdp: cleanedSdp } as unknown as SimplePeerSignalData)
                      : normalized;
                  peer.signal(toSignal);
                }
              }
            }

            const candidates = await usersAPI.getSignal(id, 'candidate');
            if (candidates && Array.isArray(candidates)) {
              for (const cand of candidates as Array<{ candidate?: unknown }>) {
                const raw = cand?.candidate;
                if (!raw) continue;
                const normalized = normalizeCandidate(raw);
                if (!normalized) continue;
                peer.signal(normalized);
              }
            }
          } catch (e) {
            void e;
          }
        }
      } finally {
        signalLockRef.current = false;
      }
    }, 2000);

    return () => {
      if (keepAliveIntervalRef.current) {
        window.clearInterval(keepAliveIntervalRef.current);
        keepAliveIntervalRef.current = null;
      }
      if (signalIntervalRef.current) {
        window.clearInterval(signalIntervalRef.current);
        signalIntervalRef.current = null;
      }
    };
  }, [activeLiveUserIds, SimplePeer]);

  useEffect(() => {
    return () => {
      if (keepAliveIntervalRef.current) window.clearInterval(keepAliveIntervalRef.current);
      if (signalIntervalRef.current) window.clearInterval(signalIntervalRef.current);
      stopAllLiveViews(false);
    };
  }, []);

  const handleLiveToggle = (userId: number) => {
    if (!SimplePeer) {
      toast.error('WebRTC libraries loading. Please try again in a moment.');
      return;
    }

    setActiveLiveUserIds((prev) => {
      if (prev.includes(userId)) return prev.filter((x) => x !== userId);
      return [...prev, userId];
    });

    if (!activeLiveUserIds.includes(userId)) {
      startLiveView(userId);
    }
  };

  const handleMeetingClick = (userId: number) => {
    setMeetingTargetUserId(userId);
    setIsMeetingModalOpen(true);
  };


  const openIdleHistory = async (userId: number, userName: string) => {
    setIdleHistoryUserId(userId);
    setIdleHistoryUserName(userName);
    setIdleHistory(null);
    setIdleHistoryLoading(true);
    try {
      const res = await teamAvailabilityAPI.getIdleHistory(userId, 14);
      if (res.success) {
        setIdleHistory(res.data);
      } else {
        setIdleHistory([]);
      }
    } catch (e) {
      void e;
      setIdleHistory([]);
    } finally {
      setIdleHistoryLoading(false);
    }
  };

  // Compute live presence metrics
  const counts = useMemo(() => {
    let working = 0;
    let available = 0;
    let paused = 0;
    let offline = 0;
    let internetIssue = 0;

    visiblePresences.forEach((p) => {
      const isOffline = p.status === 'offline';
      const isInternetIssue = !isOffline && p.internet_connected === false;
      
      if (isOffline) {
        offline++;
      } else if (isInternetIssue) {
        internetIssue++;
      } else if (p.status === 'working') {
        working++;
      } else if (p.status === 'paused') {
        paused++;
      } else if (p.status === 'available') {
        available++;
      }
    });

    return {
      total: visiblePresences.length,
      working,
      available,
      paused,
      offline,
      internetIssue,
    };
  }, [visiblePresences]);

  const getStatusBadge = (status: string, internetConnected: boolean) => {
    const isOffline = status === 'offline';
    const isInternetIssue = !isOffline && !internetConnected;

    if (isInternetIssue) {
      return (
        <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20 animate-pulse">
          <ShieldAlert className="w-3.5 h-3.5" />
          Internet Issue
        </span>
      );
    }

    switch (status) {
      case 'working':
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
            Working
          </span>
        );
      case 'available':
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-500/10 text-green-500 border border-green-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            Available
          </span>
        );
      case 'paused':
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>
            Paused
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-500/10 text-gray-400 border border-gray-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
            Offline
          </span>
        );
    }
  };

  const departments = useMemo(() => 
    Array.from(new Set(visiblePresences.map(p => p.user?.department).filter(Boolean))) as string[], 
    [visiblePresences]
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            Team Center
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Real-time control room for monitoring availability, voice signaling, live view streaming, and instant communication.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={() => setIsBroadcastModalOpen(true)}
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition shadow-lg shadow-blue-500/15 flex-1 md:flex-none"
          >
            <Megaphone className="w-4 h-4" />
            Send Broadcast
          </button>
          <button
            onClick={() => refetch()}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-750 transition text-sm font-semibold flex-1 md:flex-none"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Metric counters dashboard row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <button
          onClick={() => handleCounterFilter('')}
          className={`p-4 rounded-2xl border text-left transition shadow-sm ${
            filters.status === '' 
              ? 'bg-blue-600 border-blue-600 text-white' 
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-400'
          }`}
        >
          <p className={`text-xs font-semibold uppercase tracking-wider ${filters.status === '' ? 'text-blue-100' : 'text-gray-400'}`}>All Team</p>
          <p className="text-3xl font-extrabold mt-1.5">{counts.total}</p>
        </button>

        <button
          onClick={() => handleCounterFilter('working')}
          className={`p-4 rounded-2xl border text-left transition shadow-sm ${
            filters.status === 'working' 
              ? 'bg-blue-600 border-blue-600 text-white' 
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-400'
          }`}
        >
          <p className={`text-xs font-semibold uppercase tracking-wider ${filters.status === 'working' ? 'text-blue-100' : 'text-gray-400'}`}>🟢 Working</p>
          <p className="text-3xl font-extrabold mt-1.5 text-blue-500 dark:text-blue-400 filter-active:text-white">{counts.working}</p>
        </button>

        <button
          onClick={() => handleCounterFilter('available')}
          className={`p-4 rounded-2xl border text-left transition shadow-sm ${
            filters.status === 'available' 
              ? 'bg-blue-600 border-blue-600 text-white' 
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-400'
          }`}
        >
          <p className={`text-xs font-semibold uppercase tracking-wider ${filters.status === 'available' ? 'text-blue-100' : 'text-gray-400'}`}>🔵 Available</p>
          <p className="text-3xl font-extrabold mt-1.5 text-green-500 dark:text-green-400 filter-active:text-white">{counts.available}</p>
        </button>

        <button
          onClick={() => handleCounterFilter('paused')}
          className={`p-4 rounded-2xl border text-left transition shadow-sm ${
            filters.status === 'paused' 
              ? 'bg-blue-600 border-blue-600 text-white' 
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-400'
          }`}
        >
          <p className={`text-xs font-semibold uppercase tracking-wider ${filters.status === 'paused' ? 'text-blue-100' : 'text-gray-400'}`}>🟡 Paused</p>
          <p className="text-3xl font-extrabold mt-1.5 text-yellow-500 dark:text-yellow-400 filter-active:text-white">{counts.paused}</p>
        </button>

        <button
          onClick={() => handleCounterFilter('internet_issue')}
          className={`p-4 rounded-2xl border text-left transition shadow-sm ${
            filters.status === 'internet_issue' 
              ? 'bg-blue-600 border-blue-600 text-white' 
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-400'
          }`}
        >
          <p className={`text-xs font-semibold uppercase tracking-wider ${filters.status === 'internet_issue' ? 'text-blue-100' : 'text-gray-400'}`}>⚠️ Net Issue</p>
          <p className="text-3xl font-extrabold mt-1.5 text-amber-500 dark:text-amber-400 filter-active:text-white">{counts.internetIssue}</p>
        </button>

        <button
          onClick={() => handleCounterFilter('offline')}
          className={`p-4 rounded-2xl border text-left transition shadow-sm ${
            filters.status === 'offline' 
              ? 'bg-blue-600 border-blue-600 text-white' 
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-400'
          }`}
        >
          <p className={`text-xs font-semibold uppercase tracking-wider ${filters.status === 'offline' ? 'text-blue-100' : 'text-gray-400'}`}>⚪ Offline</p>
          <p className="text-3xl font-extrabold mt-1.5 text-gray-400 dark:text-gray-500 filter-active:text-white">{counts.offline}</p>
        </button>
      </div>

      {/* Filters Card */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <input
              type="text"
              name="search"
              placeholder="Search member..."
              value={filters.search}
              onChange={handleFilterChange}
              className="pl-9 pr-4 py-2.5 w-full border border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          {/* Status filter */}
          <div>
            <select
              name="status"
              value={filters.status}
              onChange={handleFilterChange}
              className="px-3 py-2.5 w-full border border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="">All Statuses</option>
              <option value="working">🟢 Working</option>
              <option value="available">🔵 Available</option>
              <option value="paused">🟡 Paused</option>
              <option value="internet_issue">⚠️ Internet Issue</option>
              <option value="offline">⚪ Offline</option>
            </select>
          </div>

          {/* Project filter */}
          <div>
            <select
              name="project_id"
              value={filters.project_id}
              onChange={handleFilterChange}
              className="px-3 py-2.5 w-full border border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="">All Projects</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          {/* Department filter */}
          <div>
            <select
              name="department"
              value={filters.department}
              onChange={handleFilterChange}
              className="px-3 py-2.5 w-full border border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="">All Departments</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
        </div>

        {(Object.values(filters).some(Boolean) || selectedUserIds.length > 0) && (
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-400 font-medium">
              {selectedUserIds.length > 0 ? `${selectedUserIds.length} members selected for broadcast` : ''}
            </span>
            <button
              onClick={clearFilters}
              className="text-sm font-semibold text-red-500 hover:text-red-600 dark:hover:text-red-400 transition"
            >
              Clear Filters & Selection
            </button>
          </div>
        )}
      </div>

      {/* Grid of Users */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-gray-500 dark:text-gray-400 mt-2 font-medium">Loading control board...</p>
        </div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-xl text-center">
          {error}
        </div>
      ) : visiblePresences.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center shadow-sm">
          <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-950 dark:text-white">No team members match search</h3>
          <p className="text-gray-500 dark:text-gray-400 mt-1 max-w-md mx-auto">
            Try adjusting status filters or search fields.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visiblePresences.map(presence => {
            const isOffline = presence.status === 'offline';
            const isOnline = !isOffline;
            const isWorking = presence.status === 'working';
            const isPaused = presence.status === 'paused';
            const isInternetIssue = isOnline && !presence.internet_connected;
            const isSelected = selectedUserIds.includes(presence.user_id);
            const showIdleToday = currentUser?.role === 'admin' && presence.user?.role === 'employee';
            const idleMinutesToday = presence.idle_no_movement_minutes_today ?? 0;
            const idleStreaksToday = presence.idle_no_movement_streaks_today ?? 0;

            return (
              <div 
                key={presence.id} 
                onClick={() => toggleSelectUserCard(presence.user_id)}
                className={`bg-white dark:bg-gray-800 border rounded-2xl shadow-sm hover:shadow-md transition overflow-hidden flex flex-col justify-between cursor-pointer ${
                  isSelected 
                    ? 'border-blue-500 ring-2 ring-blue-500/30' 
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                {/* Upper Body */}
                <div className="p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
                  {/* User Profile Info */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {/* Avatar with Status indicator */}
                      <div className="relative">
                        <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-655 dark:text-blue-400 flex items-center justify-center font-bold text-lg border border-blue-100/50 dark:border-blue-800">
                          {getInitials(presence.user?.name || '')}
                        </div>
                        {/* Status Ring */}
                        <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center ${
                          isInternetIssue ? 'bg-amber-500 animate-pulse' :
                          isWorking ? 'bg-blue-500' :
                          presence.status === 'available' ? 'bg-green-500' :
                          isPaused ? 'bg-yellow-500' :
                          'bg-gray-400'
                        }`} />
                      </div>

                      <div>
                        <h3 className="font-bold text-gray-950 dark:text-white line-clamp-1 flex items-center gap-1.5">
                          {presence.user?.name}
                          {isSelected && (
                            <span className="w-2 h-2 rounded-full bg-blue-650 inline-block"></span>
                          )}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium flex items-center gap-1 mt-0.5">
                          {presence.user?.department || 'General'} • {presence.user?.position || 'Employee'}
                        </p>
                      </div>
                    </div>

                    {/* Network Connection Status */}
                    <div title={presence.internet_connected ? 'Internet Connected' : 'Internet Offline'}>
                      {presence.internet_connected ? (
                        <Wifi className="w-4 h-4 text-green-500" />
                      ) : (
                        <WifiOff className="w-4 h-4 text-red-500" />
                      )}
                    </div>
                  </div>

                  {/* Status Info */}
                  <div className="flex items-center justify-between border-t border-b border-gray-100 dark:border-gray-700 py-3">
                    <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Status</span>
                    {getStatusBadge(presence.status, presence.internet_connected)}
                  </div>

                  {/* Work Tracking / Last Seen details */}
                  <div className="space-y-3 min-h-[90px] flex flex-col justify-center">
                    {isWorking && presence.tracking_started_at && !isInternetIssue && (
                      <div className="space-y-2">
                        {/* Project / Task Details */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 dark:text-gray-300">
                            <Briefcase className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                            <span className="line-clamp-1">{presence.current_project?.name || 'N/A'}</span>
                          </div>
                          {presence.current_task && (
                            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 ml-5">
                              <span className="w-1 h-1 rounded-full bg-gray-400"></span>
                              <span className="line-clamp-1">{presence.current_task.title}</span>
                            </div>
                          )}
                        </div>

                        {/* Live counter */}
                        <div className="flex items-center justify-between bg-blue-50/50 dark:bg-blue-950/20 px-3 py-1.5 rounded-lg border border-blue-100/40 dark:border-blue-900/10">
                          <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium">
                            <Clock className="w-3.5 h-3.5" />
                            Elapsed Time
                          </div>
                          <div className="text-blue-700 dark:text-blue-300">
                            <LiveTrackingCounter startedAt={presence.tracking_started_at} />
                          </div>
                        </div>

                      </div>
                    )}

                    {isInternetIssue && (
                      <div className="space-y-1 bg-amber-50/30 dark:bg-amber-950/10 py-3 px-4 border border-amber-100/20 dark:border-amber-900/10 rounded-xl text-center">
                        <ShieldAlert className="w-5 h-5 text-amber-500 mx-auto mb-1 animate-pulse" />
                        <p className="text-xs text-amber-600 dark:text-amber-400 font-bold">
                          Network Heartbeat Lost
                        </p>
                        <p className="text-[10px] text-gray-400">
                          User is experiencing connectivity issue. Auto-stop pending...
                        </p>
                      </div>
                    )}

                    {isPaused && !isInternetIssue && (
                      <div className="space-y-2 text-center bg-yellow-50/30 dark:bg-yellow-950/10 py-3 px-4 border border-yellow-100/20 dark:border-yellow-900/10 rounded-xl">
                        <Pause className="w-5 h-5 text-yellow-500 mx-auto mb-1 animate-pulse" />
                        <p className="text-xs text-yellow-600 dark:text-yellow-400 font-semibold">
                          Tracker Paused
                        </p>
                        {presence.current_project && (
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-1">
                            Paused on: {presence.current_project.name}
                          </p>
                        )}
                      </div>
                    )}

                    {presence.status === 'available' && !isInternetIssue && (
                      <div className="text-center py-4 bg-green-50/20 dark:bg-green-950/10 border border-green-100/20 dark:border-green-900/10 rounded-xl">
                        <UserCheck className="w-5 h-5 text-green-500 mx-auto mb-1" />
                        <p className="text-xs text-green-600 dark:text-green-400 font-semibold">
                          Online and Available
                        </p>
                        {presence.last_activity_at && (
                          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                            Last Active: {new Date(presence.last_activity_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                    )}

                    {isOffline && (
                      <div className="text-center py-4 bg-gray-50 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-800 rounded-xl">
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold">
                          Member is Offline
                        </p>
                        {presence.last_seen && (
                          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                            Last Seen: {new Date(presence.last_seen).toLocaleDateString()} {new Date(presence.last_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                    )}

                    {showIdleToday && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openIdleHistory(presence.user_id, presence.user?.name || '');
                        }}
                        className="w-full flex items-center justify-between bg-amber-50/40 dark:bg-amber-950/10 px-3 py-1.5 rounded-lg border border-amber-100/40 dark:border-amber-900/10 hover:bg-amber-50/60 dark:hover:bg-amber-950/20 transition"
                      >
                        <div className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300 font-medium">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          No-activity (today)
                        </div>
                        <div className="text-xs font-bold text-amber-800 dark:text-amber-200">
                          {idleMinutesToday} min{idleStreaksToday > 0 ? ` • ${idleStreaksToday} streaks` : ''}
                        </div>
                      </button>
                    )}
                  </div>
                </div>

                {/* Lower Action footer */}
                <div className="bg-gray-50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700/50 p-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleChatClick(presence.user_id, presence.user.name)}
                    className="flex-1 min-w-[70px] flex items-center justify-center gap-1 px-2.5 py-2 text-xs font-bold rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-750 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                    Chat
                  </button>


                  <button
                    onClick={() => handleMeetingClick(presence.user_id)}
                    className="flex-1 min-w-[70px] flex items-center justify-center gap-1 px-2.5 py-2 text-xs font-bold rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-750 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                  >
                    <CalendarPlus className="w-3.5 h-3.5 text-purple-500" />
                    Invite
                  </button>

                  {isWorking && (
                    <div className="w-full mt-1">
                      {activeLiveUserIds.includes(presence.user_id) && (
                        <div className="mb-2 bg-black rounded-lg overflow-hidden shadow-lg aspect-video flex items-center justify-center relative group">
                          <video 
                            ref={(el) => {
                              liveVideosRef.current[presence.user_id] = el;
                              if (el && liveStreamsRef.current[presence.user_id] && el.srcObject !== liveStreamsRef.current[presence.user_id]) {
                                el.srcObject = liveStreamsRef.current[presence.user_id];
                                el.play().catch(() => {});
                              }
                            }}
                            autoPlay 
                            playsInline 
                            muted
                            controls 
                            className="w-full h-full object-contain"
                          />
                          <div className="absolute top-2 right-2 bg-red-600 text-white px-2 py-0.5 rounded text-[10px] font-bold animate-pulse">
                              LIVE
                          </div>
                        </div>
                      )}
                      <button
                        onClick={() => handleLiveToggle(presence.user_id)}
                        className={`w-full flex items-center justify-center gap-1 px-2.5 py-2 text-xs font-bold rounded-lg transition shadow-sm ${activeLiveUserIds.includes(presence.user_id) ? 'bg-red-100 text-red-700 hover:bg-red-200 border border-red-200 animate-pulse' : 'bg-green-100 text-green-700 hover:bg-green-200 border border-green-200'}`}
                      >
                        <Video className="w-3.5 h-3.5" />
                        {activeLiveUserIds.includes(presence.user_id) ? 'Stop Live View' : 'Watch Live'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating & Side panels */}
      <ChatDrawer 
        isOpen={isChatDrawerOpen}
        userId={activeChatUserId}
        userName={activeChatUserName}
        onClose={() => {
          setIsChatDrawerOpen(false);
          setActiveChatUserId(null);
        }}
      />

      <MeetingInviteModal
        isOpen={isMeetingModalOpen}
        targetUserId={meetingTargetUserId}
        onClose={() => {
          setIsMeetingModalOpen(false);
          setMeetingTargetUserId(null);
        }}
      />

      <BroadcastModal
        isOpen={isBroadcastModalOpen}
        selectedIds={selectedUserIds}
        presences={presences}
        onClose={() => {
          setIsBroadcastModalOpen(false);
          setSelectedUserIds([]);
        }}
      />

      {idleHistoryUserId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => {
            setIdleHistoryUserId(null);
            setIdleHistoryUserName('');
            setIdleHistory(null);
          }}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <div className="font-extrabold text-gray-950 dark:text-white">
                No-activity history • {idleHistoryUserName || `User ${idleHistoryUserId}`}
              </div>
              <button
                type="button"
                onClick={() => {
                  setIdleHistoryUserId(null);
                  setIdleHistoryUserName('');
                  setIdleHistory(null);
                }}
                className="text-gray-500 hover:text-gray-900 dark:hover:text-white px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              >
                Close
              </button>
            </div>

            <div className="p-4">
              {idleHistoryLoading ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
              ) : !idleHistory || idleHistory.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">No data</div>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {idleHistory
                    .slice()
                    .reverse()
                    .map((d) => (
                      <div
                        key={d.date}
                        className="flex items-center justify-between px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30"
                      >
                        <div className="text-sm font-bold text-gray-900 dark:text-white">{d.date}</div>
                        <div className="text-sm font-bold text-amber-800 dark:text-amber-200">
                          {d.idle_minutes} min{d.streaks > 0 ? ` • ${d.streaks} streaks` : ''}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
