import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { useChat } from '../hooks/useChat';
import { chatAPI } from '../api/chat';
import { usersAPI } from '../api/users';
import type { User } from '../types';
import type { Conversation, ChatMessage } from '../types/chat';
import {
  MessageSquare,
  Send,
  Search,
  Plus,
  ArrowLeft,
  Users,
  User as UserIcon,
  Smile,
  Paperclip,
  Check,
  CheckCheck,
  Circle,
  X,
  Building,
  Briefcase,
  Trash2,
  Settings,
  Eraser
} from 'lucide-react';

export default function Chat() {
  const [searchParams, setSearchParams] = useSearchParams();
  const targetUserId = searchParams.get('userId');

  const { user: currentUser } = useAuthStore();
  const {
    conversations,
    activeConversationId,
    messages,
    typingUsers,
    fetchConversations,
    setActiveConversationId,
    fetchMessages,
    addMessage,
  } = useChatStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [messageText, setMessageText] = useState('');
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  
  // Group chat creation states
  const [isGroupChat, setIsGroupChat] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);

  // Admin Group Management
  const [showManageGroupModal, setShowManageGroupModal] = useState(false);
  const [manageGroupSearch, setManageGroupSearch] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const isTypingRef = useRef(false);

  // Subscribe to active conversation WebSocket events
  useChat(activeConversationId);

  // Load conversations initially
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (activeConversationId) {
      fetchMessages(activeConversationId);
    }
  }, [activeConversationId, fetchMessages]);

  // Handle direct navigation via query params (e.g. from Team Availability page)
  useEffect(() => {
    if (targetUserId && conversations.length > 0) {
      const recipientId = parseInt(targetUserId);
      // Check if a direct chat already exists
      const existingConv = conversations.find(
        (c) => c.type === 'direct' && c.participants.some((p) => p.id === recipientId)
      );

      if (existingConv) {
        setActiveConversationId(existingConv.id);
        // Clear params
        setSearchParams({});
      } else {
        // Create a new direct chat
        startDirectChat(recipientId);
      }
    }
  }, [targetUserId, conversations]);

  useEffect(() => {
    return () => {
      setActiveConversationId(null);
    };
  }, [setActiveConversationId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  // Fetch users for new chat modal
  const openNewChatModal = async () => {
    setShowNewChatModal(true);
    setLoadingUsers(true);
    try {
      const res = await usersAPI.getUsers({ status: 'active' });
      // Exclude current user from list
      const filtered = res.data.filter((u) => u.id !== currentUser?.id);
      setUsersList(filtered);
    } catch (e) {
      void e;
    } finally {
      setLoadingUsers(false);
    }
  };

  const closeNewChatModal = () => {
    setShowNewChatModal(false);
    setIsGroupChat(false);
    setGroupName('');
    setSelectedUserIds([]);
    setModalSearch('');
  };

  const startDirectChat = async (recipientId: number) => {
    try {
      const res = await chatAPI.createConversation({
        type: 'direct',
        recipient_id: recipientId,
      });
      if (res.success) {
        await fetchConversations();
        setActiveConversationId(res.conversation_id);
        closeNewChatModal();
        setSearchParams({});
      }
    } catch (e) {
      void e;
    }
  };

  const startGroupChat = async () => {
    if (!groupName.trim() || selectedUserIds.length === 0) return;
    try {
      const res = await chatAPI.createConversation({
        type: 'group',
        name: groupName,
        participant_ids: selectedUserIds,
      });
      if (res.success) {
        await fetchConversations();
        setActiveConversationId(res.conversation_id);
        closeNewChatModal();
      }
    } catch (e) {
      void e;
    }
  };

  const toggleSelectUser = (id: number) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((userId) => userId !== id) : [...prev, id]
    );
  };

  // Handle typing status broadcast
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

  // Send message handler
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !activeConversationId) return;

    // Clear typing timeout if active
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
        fetchConversations();
      }
    } catch (e) {
      void e;
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const getAvatarBg = (name: string) => {
    const colors = [
      'bg-indigo-500 text-white',
      'bg-blue-500 text-white',
      'bg-emerald-500 text-white',
      'bg-teal-500 text-white',
      'bg-cyan-500 text-white',
      'bg-purple-500 text-white',
      'bg-pink-500 text-white',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const formatTime = (timeStr: string) => {
    const date = new Date(timeStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatMessageDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  // Find active conversation details
  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const activeRecipient = activeConversation?.participants[0]; // For direct chats
  const activeTypers = activeConversationId ? typingUsers[activeConversationId] || [] : [];

  // Filter conversations based on search
  const filteredConversations = conversations.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter users in modal
  const filteredUsersForNewChat = usersList.filter((u) =>
    u.name.toLowerCase().includes(modalSearch.toLowerCase()) ||
    (u.department && u.department.toLowerCase().includes(modalSearch.toLowerCase()))
  );

  return (
    <div className="h-[calc(100vh-80px)] flex border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-sm relative">
      {/* Left panel: Conversations list */}
      <div className={`w-full md:w-80 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col ${
        activeConversationId ? 'hidden md:flex' : 'flex'
      }`}>
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/30">
          <h2 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-1.5">
            <MessageSquare className="w-5 h-5 text-indigo-500" />
            Chats
          </h2>
          <button
            onClick={openNewChatModal}
            className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition"
            title="New Chat"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Sidebar Search */}
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search chat..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 w-full text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
          {filteredConversations.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              No conversations found.
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = conv.id === activeConversationId;
              const isGroup = conv.type === 'group';
              const recipientStatus = !isGroup ? conv.participants[0]?.status ?? 'offline' : 'offline';
              const isUserOnline = recipientStatus !== 'offline';
              
              return (
                <div
                  key={conv.id}
                  onClick={() => setActiveConversationId(conv.id)}
                  className={`p-3 flex items-start gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40 transition relative ${
                    isSelected ? 'bg-indigo-50/60 dark:bg-indigo-950/20' : ''
                  }`}
                >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm ${getAvatarBg(conv.name)}`}>
                      {isGroup ? <Users className="w-5 h-5 text-white" /> : getInitials(conv.name)}
                    </div>
                    {/* Status Dot for direct chats */}
                    {!isGroup && (
                      <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-gray-900 ${
                        recipientStatus === 'working' ? 'bg-blue-500' :
                        recipientStatus === 'available' ? 'bg-green-500' :
                        recipientStatus === 'paused' ? 'bg-yellow-500' :
                        'bg-gray-400'
                      }`} />
                    )}
                  </div>

                  {/* Conv Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline gap-1">
                      <h4 className="font-semibold text-sm text-gray-900 dark:text-white truncate">{conv.name}</h4>
                      {conv.last_message_at && (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
                          {formatTime(conv.last_message_at)}
                        </span>
                      )}
                    </div>
                    
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                      {conv.latest_message ? (
                        <>
                          <span className="font-medium text-gray-600 dark:text-gray-300 mr-0.5">
                            {conv.latest_message.sender_id === currentUser?.id ? 'You: ' : `${conv.latest_message.sender_name}: `}
                          </span>
                          {conv.latest_message.body}
                        </>
                      ) : (
                        'No messages yet.'
                      )}
                    </p>
                  </div>

                  {/* Unread Count Badge */}
                  {conv.unread_count > 0 && (
                    <div className="absolute right-3 top-7 px-1.5 py-0.5 rounded-full bg-indigo-600 text-[10px] font-bold text-white leading-none">
                      {conv.unread_count}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right panel: Active Chat view */}
      <div className={`flex-1 flex flex-col ${
        activeConversationId ? 'flex' : 'hidden md:flex'
      }`}>
        {activeConversationId && activeConversation ? (
          <>
            {/* Active Chat Header */}
            <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-900 relative z-10 shadow-sm">
              <div className="flex items-center gap-3">
                {/* Back button for mobile */}
                <button
                  onClick={() => setActiveConversationId(null)}
                  className="md:hidden p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                {/* Avatar */}
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs ${getAvatarBg(activeConversation.name)}`}>
                  {activeConversation.type === 'group' ? <Users className="w-4 h-4 text-white" /> : getInitials(activeConversation.name)}
                </div>

                <div>
                  <h3 className="font-bold text-sm text-gray-950 dark:text-white leading-none">
                    {activeConversation.name}
                  </h3>
                  {activeConversation.type === 'direct' && activeRecipient && (
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 font-semibold mt-1">
                      {activeRecipient.status === 'working' ? '⏱️ Working' :
                       activeRecipient.status === 'available' ? '🟢 Available' :
                       activeRecipient.status === 'paused' ? '⏸️ Paused' :
                       '⚪ Offline'}
                    </p>
                  )}
                  {activeConversation.type === 'group' && (
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 font-semibold mt-1">
                      Group • {activeConversation.participants.length + 1} members
                    </p>
                  )}
                </div>
              </div>

              {/* Header Right Action icons */}
              <div className="flex items-center gap-2">
                {/* Admin Group Management */}
                {currentUser?.role === 'admin' && (
                  <>
                    {activeConversation.type === 'group' && (
                      <button
                        onClick={async () => {
                          setShowManageGroupModal(true);
                          if (usersList.length === 0) {
                            try {
                              const res = await usersAPI.getUsers({ status: 'active' });
                              setUsersList(res.data.filter((u) => u.id !== currentUser?.id));
                            } catch (e) { void e; }
                          }
                        }}
                        className="p-2 rounded-lg border text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 border-gray-200 dark:border-gray-700 transition"
                        title="Manage Group"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        if (window.confirm('Are you sure you want to clear all messages in this chat? This cannot be undone.')) {
                          try {
                            await chatAPI.clearMessages(activeConversation.id);
                            useChatStore.getState().clearMessages(activeConversation.id);
                          } catch (e) {
                            alert('Failed to clear messages.');
                          }
                        }
                      }}
                      className="p-2 rounded-lg border text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/20 border-orange-200 dark:border-orange-900/50 transition"
                      title="Clear Chat History"
                    >
                      <Eraser className="w-4 h-4" />
                    </button>
                    <button
                      onClick={async () => {
                        if (window.confirm('Are you sure you want to delete this chat permanently?')) {
                          try {
                            await chatAPI.deleteConversation(activeConversation.id);
                            useChatStore.getState().removeConversation(activeConversation.id);
                          } catch (e) {
                            alert('Failed to delete conversation.');
                          }
                        }
                      }}
                      className="p-2 rounded-lg border text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 border-red-200 dark:border-red-900/50 transition"
                      title="Delete Conversation"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}

              </div>
            </div>

            {/* Message Area */}
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50 dark:bg-gray-950/20 space-y-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
                  <MessageSquare className="w-10 h-10 text-gray-300 dark:text-gray-700 mb-2 animate-bounce" />
                  <p>No messages yet. Send a message to start conversation!</p>
                </div>
              ) : (
                messages.map((msg, index) => {
                  const isSelf = msg.sender_id === currentUser?.id;
                  const showDateSeparator = index === 0 || 
                    new Date(messages[index - 1].created_at).toDateString() !== new Date(msg.created_at).toDateString();
                  
                  if (msg.type === 'system') {
                    return (
                      <React.Fragment key={msg.id}>
                        {showDateSeparator && (
                          <div className="flex justify-center my-3">
                            <span className="text-[10px] font-semibold tracking-wide uppercase px-2.5 py-0.5 rounded-full bg-gray-200/80 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                              {formatMessageDate(msg.created_at)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-center">
                          <span className="text-[11px] text-gray-500 dark:text-gray-400 italic bg-gray-100 dark:bg-gray-800/50 px-3 py-1 rounded-full">
                            {msg.body}
                          </span>
                        </div>
                      </React.Fragment>
                    );
                  }

                  return (
                    <React.Fragment key={msg.id}>
                      {showDateSeparator && (
                        <div className="flex justify-center my-3">
                          <span className="text-[10px] font-semibold tracking-wide uppercase px-2.5 py-0.5 rounded-full bg-gray-200/80 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                            {formatMessageDate(msg.created_at)}
                          </span>
                        </div>
                      )}

                      <div className={`flex gap-2 ${isSelf ? 'justify-end' : 'justify-start'}`}>
                        {/* Sender Avatar for group chat */}
                        {!isSelf && activeConversation.type === 'group' && (
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0 self-end ${getAvatarBg(msg.sender_name)}`}>
                            {getInitials(msg.sender_name)}
                          </div>
                        )}

                        <div className="max-w-[70%] space-y-0.5">
                          {/* Sender name in group */}
                          {!isSelf && activeConversation.type === 'group' && (
                            <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 ml-1.5">
                              {msg.sender_name}
                            </p>
                          )}

                          {/* Bubble card */}
                          <div className={`p-3 rounded-2xl shadow-sm ${
                            isSelf
                              ? 'bg-indigo-600 text-white rounded-br-none'
                              : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-100 dark:border-gray-700 rounded-bl-none'
                          }`}>
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.body}</p>
                            
                            <div className="flex items-center justify-end gap-1 mt-1">
                              <span className={`text-[9px] ${isSelf ? 'text-indigo-200' : 'text-gray-400'}`}>
                                {formatTime(msg.created_at)}
                              </span>
                              {isSelf && (
                                <CheckCheck className="w-3 h-3 text-indigo-200" />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })
              )}

              {/* Active Typer Indicator */}
              {activeTypers.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 italic ml-1">
                  <span className="flex gap-0.5 items-center mr-0.5">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                  {activeTypers.join(', ')} {activeTypers.length === 1 ? 'is' : 'are'} typing...
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input Form */}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-gray-200 dark:border-gray-700 flex gap-2 items-center bg-white dark:bg-gray-900">
              <button
                type="button"
                onClick={() => alert('Attachments are not supported in this version.')}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <input
                type="text"
                value={messageText}
                onChange={handleMessageChange}
                placeholder="Type a message..."
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />

              <button
                type="submit"
                disabled={!messageText.trim()}
                className={`p-2 rounded-xl text-white transition ${
                  messageText.trim() ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                }`}
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </>
        ) : (
          /* Empty Chat view */
          <div className="flex-1 flex flex-col items-center justify-center bg-gray-50/30 dark:bg-gray-900/10 p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/20 text-indigo-500 flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-gray-950 dark:text-white">WND Tracker Chat</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
              Connect with your teammates in real-time. Start a new direct conversation or create a group chat.
            </p>
            <button
              onClick={openNewChatModal}
              className="mt-4 flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              Start Messaging
            </button>
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900 bg-opacity-50">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden shadow-xl flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/30">
              <h3 className="font-bold text-gray-900 dark:text-white text-base">New Conversation</h3>
              <button
                onClick={closeNewChatModal}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Search and Group toggle */}
            <div className="p-3 border-b border-gray-200 dark:border-gray-700 space-y-3">
              <div className="flex border-b border-gray-200 dark:border-gray-700 text-sm">
                <button
                  onClick={() => setIsGroupChat(false)}
                  className={`flex-1 pb-2 font-semibold text-center border-b-2 transition ${
                    !isGroupChat ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Direct Chat
                </button>
                <button
                  onClick={() => setIsGroupChat(true)}
                  className={`flex-1 pb-2 font-semibold text-center border-b-2 transition ${
                    isGroupChat ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Group Chat
                </button>
              </div>

              {isGroupChat && (
                <input
                  type="text"
                  placeholder="Enter group name..."
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="px-3 py-1.5 w-full text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              )}

              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search user..."
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 w-full text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Modal Users List */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800 p-2">
              {loadingUsers ? (
                <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
                  Loading users...
                </div>
              ) : filteredUsersForNewChat.length === 0 ? (
                <div className="text-center py-6 text-sm text-gray-400">
                  No active users found.
                </div>
              ) : (
                filteredUsersForNewChat.map((u) => {
                  const isSelected = selectedUserIds.includes(u.id);
                  return (
                    <div
                      key={u.id}
                      onClick={() => (isGroupChat ? toggleSelectUser(u.id) : startDirectChat(u.id))}
                      className="p-2.5 flex items-center justify-between rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${getAvatarBg(u.name)}`}>
                          {getInitials(u.name)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white leading-none">{u.name}</p>
                          <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium mt-1">
                            {u.department || 'General'} • {u.position || 'Employee'}
                          </p>
                        </div>
                      </div>

                      {isGroupChat && (
                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition ${
                          isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300 dark:border-gray-700'
                        }`}>
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer (For Group Chats) */}
            {isGroupChat && (
              <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 flex justify-end gap-2">
                <button
                  onClick={closeNewChatModal}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={startGroupChat}
                  disabled={!groupName.trim() || selectedUserIds.length === 0}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg text-white transition ${
                    groupName.trim() && selectedUserIds.length > 0
                      ? 'bg-indigo-600 hover:bg-indigo-700'
                      : 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  Create Group
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Admin Manage Group Modal */}
      {showManageGroupModal && activeConversation && activeConversation.type === 'group' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900 bg-opacity-50">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden shadow-xl flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/30">
              <h3 className="font-bold text-gray-900 dark:text-white text-base">Manage Members</h3>
              <button
                onClick={() => {
                  setShowManageGroupModal(false);
                  setManageGroupSearch('');
                }}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 border-b border-gray-200 dark:border-gray-700">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search to add users..."
                  value={manageGroupSearch}
                  onChange={(e) => setManageGroupSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 w-full text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 divide-y divide-gray-100 dark:divide-gray-800">
              <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Current Members</div>
              {activeConversation.participants.map((p) => (
                <div key={p.id} className="p-2 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/30 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[10px] ${getAvatarBg(p.name)}`}>
                      {getInitials(p.name)}
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{p.name}</span>
                  </div>
                  <button
                    onClick={async () => {
                      if (window.confirm(`Remove ${p.name} from this group?`)) {
                        try {
                          await chatAPI.removeParticipant(activeConversation.id, p.id);
                          useChatStore.getState().removeGroupParticipant(activeConversation.id, p.id);
                        } catch (e) {
                          alert('Failed to remove user');
                        }
                      }
                    }}
                    className="text-xs font-semibold text-red-500 hover:text-red-700 dark:hover:text-red-400 px-2 py-1 rounded-md transition"
                  >
                    Remove
                  </button>
                </div>
              ))}

              {manageGroupSearch && (
                <div className="mt-4">
                  <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Add New Members</div>
                  {usersList
                    .filter(
                      (u) =>
                        !activeConversation.participants.some((p) => p.id === u.id) &&
                        u.name.toLowerCase().includes(manageGroupSearch.toLowerCase())
                    )
                    .map((u) => (
                      <div key={u.id} className="p-2 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/30 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[10px] ${getAvatarBg(u.name)}`}>
                            {getInitials(u.name)}
                          </div>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{u.name}</span>
                        </div>
                        <button
                          onClick={async () => {
                            try {
                              await chatAPI.addParticipant(activeConversation.id, [u.id]);
                              setManageGroupSearch('');
                            } catch (e) {
                              alert('Failed to add user');
                            }
                          }}
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 px-2 py-1 rounded-md transition"
                        >
                          Add
                        </button>
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
