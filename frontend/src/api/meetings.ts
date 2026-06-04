import { api } from '../lib/api';
import type { Meeting, MeetingMessage, MeetingsList } from '../types/meetings';

export interface MeetingsResponse {
  success: boolean;
  data: MeetingsList;
}

export interface MeetingDetailsResponse {
  success: boolean;
  data: Meeting;
}

export interface MeetingMessagesResponse {
  success: boolean;
  data: MeetingMessage[];
}

export interface MeetingMessageResponse {
  success: boolean;
  data: MeetingMessage;
}

export const meetingsAPI = {
  getMeetings: async (): Promise<MeetingsResponse> => {
    const response = await api.get('/meetings');
    return response.data;
  },

  createMeeting: async (data: {
    title: string;
    description?: string;
    type: 'team' | 'one_on_one' | 'department';
    scheduled_at: string;
    duration_minutes: number;
    participants: number[];
  }): Promise<MeetingDetailsResponse> => {
    const response = await api.post('/meetings', data);
    return response.data;
  },

  getMeetingDetails: async (id: number): Promise<MeetingDetailsResponse> => {
    const response = await api.get(`/meetings/${id}`);
    return response.data;
  },

  updateMeeting: async (
    id: number,
    data: {
      title: string;
      description?: string;
      type: 'team' | 'one_on_one' | 'department';
      scheduled_at: string;
      duration_minutes: number;
      participants: number[];
    }
  ): Promise<MeetingDetailsResponse> => {
    const response = await api.put(`/meetings/${id}`, data);
    return response.data;
  },

  cancelMeeting: async (id: number): Promise<{ success: boolean; message: string }> => {
    const response = await api.delete(`/meetings/${id}`);
    return response.data;
  },

  startMeeting: async (id: number): Promise<MeetingDetailsResponse> => {
    const response = await api.post(`/meetings/${id}/start`);
    return response.data;
  },

  endMeeting: async (id: number): Promise<MeetingDetailsResponse> => {
    const response = await api.post(`/meetings/${id}/end`);
    return response.data;
  },

  joinMeeting: async (id: number): Promise<{ success: boolean; message: string }> => {
    const response = await api.post(`/meetings/${id}/join`);
    return response.data;
  },

  leaveMeeting: async (id: number): Promise<{ success: boolean; message: string }> => {
    const response = await api.post(`/meetings/${id}/leave`);
    return response.data;
  },

  respondToInvitation: async (
    id: number,
    status: 'accepted' | 'declined'
  ): Promise<{ success: boolean; message: string; data: any }> => {
    const response = await api.post(`/meetings/${id}/respond`, { status });
    return response.data;
  },

  getMeetingMessages: async (id: number): Promise<MeetingMessagesResponse> => {
    const response = await api.get(`/meetings/${id}/messages`);
    return response.data;
  },

  sendMeetingMessage: async (id: number, message: string): Promise<MeetingMessageResponse> => {
    const response = await api.post(`/meetings/${id}/messages`, { message });
    return response.data;
  },
};
