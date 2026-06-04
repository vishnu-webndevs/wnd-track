import { create } from 'zustand';

export interface MeetingInvite {
  meetingId: number;
  title: string;
  hostName: string;
}

interface MeetingInviteState {
  activeInvite: MeetingInvite | null;
  setInvite: (invite: MeetingInvite | null) => void;
}

export const useMeetingInviteStore = create<MeetingInviteState>((set) => ({
  activeInvite: null,
  setInvite: (invite) => set({ activeInvite: invite }),
}));
