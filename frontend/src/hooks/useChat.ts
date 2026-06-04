import { useEffect, useRef } from 'react';
import { getEcho } from '../lib/echo';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import type { ChatMessage } from '../types/chat';

export function useChat(conversationId: number | null) {
  const { user, isAuthenticated } = useAuthStore();
  const { addMessage, setTyping, markConversationRead } = useChatStore();
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!isAuthenticated || !conversationId || !user?.id) return;

    let echo: any;
    try {
      echo = getEcho();
      const channelName = `conversation.${conversationId}`;
      const channel = echo.private(channelName);
      channelRef.current = channel;

      // Mark as read when entering
      markConversationRead(conversationId).catch(console.error);

      // Listen for new messages
      channel.listen('.new.chat.message', (data: { message: ChatMessage }) => {
        addMessage(data.message);
        
        // Mark conversation as read if active
        if (conversationId === data.message.conversation_id) {
          markConversationRead(conversationId).catch(console.error);
        }
      });

      // Listen for read receipts
      channel.listen('.message.read', (data: { conversation_id: number; user_id: number; read_at: string }) => {
        // Handle read receipt updates locally if needed
      });

      // Listen for typing whispers
      channel.listen('.user.typing', (data: { conversation_id: number; user_id: number; user_name: string; is_typing: boolean }) => {
        if (data.user_id !== user.id) {
          setTyping(data.conversation_id, data.user_name, data.is_typing);
        }
      });

    } catch (e) {
      console.warn('Failed to join conversation channel:', e);
    }

    return () => {
      if (channelRef.current && echo) {
        try {
          echo.leave(`conversation.${conversationId}`);
        } catch {
          // ignore
        }
        channelRef.current = null;
      }
    };
  }, [isAuthenticated, conversationId, user?.id]);
}
