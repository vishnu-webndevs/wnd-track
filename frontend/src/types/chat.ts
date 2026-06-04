export interface ChatParticipant {
  id: number;
  name: string;
  role: string;
  department: string | null;
  position: string | null;
  status: 'available' | 'working' | 'paused' | 'offline';
  internet_connected: boolean;
  last_seen: string | null;
}

export interface ChatMessage {
  id: number;
  conversation_id: number;
  sender_id: number;
  sender_name: string;
  body: string;
  type: 'text' | 'file' | 'image' | 'system';
  file_path?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  created_at: string;
}

export interface Conversation {
  id: number;
  type: 'direct' | 'group';
  name: string;
  created_by?: number;
  last_message_at: string | null;
  unread_count: number;
  latest_message: ChatMessage | null;
  participants: ChatParticipant[];
}
