import { api } from '../lib/api';

export interface InitiateCallResponse {
  success: boolean;
  session_id: string;
  caller_id: number;
  recipient_id: number;
}

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceServersResponse {
  success: boolean;
  iceServers: IceServer[];
}

export const voiceAPI = {
  initiateCall: async (recipientId: number, type: 'voice' | 'video' = 'voice'): Promise<InitiateCallResponse> => {
    const response = await api.post('/voice/initiate', { recipient_id: recipientId, type });
    return response.data;
  },

  sendSignal: async (sessionId: string, signal: unknown): Promise<{ success: boolean }> => {
    const response = await api.post('/voice/signal', { session_id: sessionId, signal });
    return response.data;
  },

  endCall: async (sessionId: string): Promise<{ success: boolean }> => {
    const response = await api.post('/voice/end', { session_id: sessionId });
    return response.data;
  },

  getIceServers: async (): Promise<IceServersResponse> => {
    const response = await api.get('/voice/ice-servers');
    return response.data;
  },
};
