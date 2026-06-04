import { api } from '../lib/api';
import type { Conversation, ChatMessage } from '../types/chat';

export interface ConversationsResponse {
  success: boolean;
  data: Conversation[];
}

export interface CreateConversationResponse {
  success: boolean;
  conversation_id: number;
}

export interface MessagesResponse {
  success: boolean;
  data: ChatMessage[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

export interface SendMessageResponse {
  success: boolean;
  data: ChatMessage;
}

export const chatAPI = {
  getConversations: async (): Promise<ConversationsResponse> => {
    const response = await api.get('/chat/conversations');
    return response.data;
  },

  createConversation: async (data: {
    type: 'direct' | 'group';
    recipient_id?: number;
    name?: string;
    participant_ids?: number[];
  }): Promise<CreateConversationResponse> => {
    const response = await api.post('/chat/conversations', data);
    return response.data;
  },

  getMessages: async (
    conversationId: number,
    page: number = 1,
    perPage: number = 50
  ): Promise<MessagesResponse> => {
    const response = await api.get(`/chat/conversations/${conversationId}/messages`, {
      params: { page, per_page: perPage },
    });
    return response.data;
  },

  sendMessage: async (conversationId: number, body: string): Promise<SendMessageResponse> => {
    const response = await api.post(`/chat/conversations/${conversationId}/messages`, { body });
    return response.data;
  },

  markRead: async (conversationId: number): Promise<{ success: boolean }> => {
    const response = await api.put(`/chat/conversations/${conversationId}/read`);
    return response.data;
  },

  getUnreadCount: async (): Promise<number> => {
    const response = await api.get('/chat/unread-count');
    return response.data.count;
  },

  sendTyping: async (conversationId: number, isTyping: boolean): Promise<{ success: boolean }> => {
    const response = await api.post(`/chat/conversations/${conversationId}/typing`, { is_typing: isTyping });
    return response.data;
  },
};
