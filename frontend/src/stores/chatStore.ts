import { create } from 'zustand';
import { chatAPI } from '../api/chat';
import type { Conversation, ChatMessage } from '../types/chat';
import { useAuthStore } from './authStore';

interface ChatState {
  conversations: Conversation[];
  activeConversationId: number | null;
  messages: ChatMessage[];
  totalUnreadCount: number;
  typingUsers: Record<number, string[]>; // keyed by conversationId
  
  setConversations: (conversations: Conversation[]) => void;
  setActiveConversationId: (id: number | null) => void;
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  setTotalUnreadCount: (count: number) => void;
  setTyping: (conversationId: number, userName: string, isTyping: boolean) => void;
  
  fetchConversations: () => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  fetchMessages: (conversationId: number) => Promise<void>;
  markConversationRead: (conversationId: number) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  totalUnreadCount: 0,
  typingUsers: {},

  setConversations: (conversations) => set({ conversations }),
  setActiveConversationId: (activeConversationId) => {
    // When active conversation changes, reset typing status and clear messages
    set({ activeConversationId, messages: [] });
  },
  setMessages: (messages) => set({ messages }),
  
  addMessage: (message) => {
    const { activeConversationId, conversations } = get();
    
    // Only append message to current active list if it belongs to this conversation
    if (activeConversationId === message.conversation_id) {
      set((state) => ({
        messages: [...state.messages, message],
      }));
    }

    // Update conversations list latest message and sort
    const updatedConversations = conversations.map((conv) => {
      if (conv.id === message.conversation_id) {
        const isSelf = message.sender_id === useAuthStore.getState().user?.id;
        return {
          ...conv,
          last_message_at: message.created_at,
          unread_count: activeConversationId === conv.id ? 0 : conv.unread_count + (isSelf ? 0 : 1),
          latest_message: {
            id: message.id,
            conversation_id: message.conversation_id,
            body: message.body,
            sender_id: message.sender_id,
            sender_name: message.sender_name,
            type: message.type,
            created_at: message.created_at,
          },
        };
      }
      return conv;
    });

    // Sort by last message time
    updatedConversations.sort((a, b) => {
      const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return timeB - timeA;
    });

    set({ conversations: updatedConversations });
    
    // Recalculate total unread
    get().fetchUnreadCount();
  },

  setTotalUnreadCount: (totalUnreadCount) => set({ totalUnreadCount }),

  setTyping: (conversationId, userName, isTyping) => {
    set((state) => {
      const current = state.typingUsers[conversationId] || [];
      let updated;
      if (isTyping) {
        updated = current.includes(userName) ? current : [...current, userName];
      } else {
        updated = current.filter((u) => u !== userName);
      }
      return {
        typingUsers: {
          ...state.typingUsers,
          [conversationId]: updated,
        },
      };
    });
  },

  fetchConversations: async () => {
    try {
      const res = await chatAPI.getConversations();
      if (res.success) {
        set({ conversations: res.data });
      }
    } catch (e) {
      void e;
    }
  },

  fetchUnreadCount: async () => {
    try {
      const count = await chatAPI.getUnreadCount();
      set({ totalUnreadCount: count });
    } catch (e) {
      void e;
    }
  },

  fetchMessages: async (conversationId) => {
    try {
      const res = await chatAPI.getMessages(conversationId);
      if (res.success) {
        set({ messages: res.data });
        
        // After fetching, mark the conversation as read locally
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId ? { ...c, unread_count: 0 } : c
          ),
        }));
        
        get().fetchUnreadCount();
      }
    } catch (e) {
      void e;
    }
  },

  markConversationRead: async (conversationId) => {
    try {
      await chatAPI.markRead(conversationId);
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === conversationId ? { ...c, unread_count: 0 } : c
        ),
      }));
      get().fetchUnreadCount();
    } catch (e) {
      void e;
    }
  },
}));
