import { User } from './index';

export interface MeetingParticipantPivot {
  meeting_id: number;
  user_id: number;
  role: 'host' | 'participant';
  status: 'invited' | 'accepted' | 'declined' | 'joined' | 'left';
  joined_at?: string;
  left_at?: string;
}

export interface MeetingParticipant extends User {
  pivot: MeetingParticipantPivot;
}

export interface Meeting {
  id: number;
  title: string;
  description?: string;
  type: 'team' | 'one_on_one' | 'department';
  status: 'scheduled' | 'live' | 'completed' | 'cancelled';
  created_by: number;
  creator?: {
    id: number;
    name: string;
  };
  scheduled_at: string;
  duration_minutes: number;
  started_at?: string;
  ended_at?: string;
  meeting_link?: string;
  participants: MeetingParticipant[];
  created_at: string;
  updated_at: string;
}

export interface MeetingMessage {
  id: number;
  meeting_id: number;
  user_id: number;
  user_name: string;
  message: string;
  created_at: string;
}

export interface MeetingsList {
  upcoming: Meeting[];
  live: Meeting[];
  completed: Meeting[];
  cancelled: Meeting[];
}
