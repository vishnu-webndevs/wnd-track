import { create } from 'zustand';
import { meetingsAPI } from '../api/meetings';
import { voiceAPI } from '../api/voice';
import { getEcho } from '../lib/echo';
import { useAuthStore } from './authStore';
import { toast } from 'sonner';
import type { Meeting, MeetingMessage, MeetingParticipant } from '../types/meetings';

// Non-serializable mutable state stored outside Zustand state to prevent infinite renders
let pcs: Record<number, RTCPeerConnection> = {};
let videoTransceivers: Record<number, RTCRtpTransceiver> = {};
let localStreamInstance: MediaStream | null = null;
let screenStreamInstance: MediaStream | null = null;
let presenceChannel: any = null;
let privateChannel: any = null;
let echoInstance: any = null;
let renegotiateTimer: any = null;
let renegotiateAttempt: Record<number, number> = {};
let mediaRecorderInstance: MediaRecorder | null = null;
let recordingChunks: Blob[] = [];
let recordingTimer: any = null;
let elapsedTimer: any = null;

interface MeetingState {
  meetingId: number | null;
  meeting: Meeting | null;
  minimized: boolean;
  micActive: boolean;
  cameraActive: boolean;
  screenSharing: boolean;
  localStream: MediaStream | null;
  remoteStreams: Record<number, MediaStream>;
  activeMembers: Array<{ id: number; name: string; role: string }>;
  messages: MeetingMessage[];
  audioBlocked: boolean;

  audioInputs: MediaDeviceInfo[];
  videoInputs: MediaDeviceInfo[];
  audioOutputs: MediaDeviceInfo[];

  selectedMicId: string;
  selectedCamId: string;
  selectedSpeakerId: string;

  peerVideoEnabled: Record<number, boolean>;
  peerMicEnabled: Record<number, boolean>;
  peerVideoActive: Record<number, boolean>;

  recording: boolean;
  recordingDuration: number;
  meetingElapsedSec: number;
  durationLimitReached: boolean;
  showDeviceSettings: boolean;

  // Actions
  initRoom: (id: number) => Promise<void>;
  leaveRoom: () => Promise<void>;
  endRoom: () => Promise<void>;
  toggleMic: () => void;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  stopScreenShare: () => void;
  switchMicrophone: (deviceId: string) => Promise<void>;
  switchCameraDevice: (deviceId: string) => Promise<void>;
  switchSpeaker: (deviceId: string) => Promise<void>;
  refreshDevices: () => Promise<void>;
  requestPermissions: () => Promise<void>;
  setAudioBlocked: (blocked: boolean) => void;
  setShowDeviceSettings: (show: boolean) => void;
  setMinimized: (minimized: boolean) => void;
  sendMessage: (message: string) => Promise<void>;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  extendMeeting: (minutes: number) => Promise<void>;
  dismissDurationWarning: () => void;
}

export const useMeetingStore = create<MeetingState>()((set, get) => {
  const sanitizeSdp = (sdp: string) => {
    if (!sdp) return sdp;
    const lines = sdp.split(/\r\n|\n/);
    const rebuilt = lines.join('\r\n').trim();
    return rebuilt ? `${rebuilt}\r\n` : rebuilt;
  };

  const broadcastMediaState = (overrides?: { videoEnabled?: boolean; micEnabled?: boolean }) => {
    const channel = presenceChannel;
    if (!channel) return;
    const user = useAuthStore.getState().user;
    const myId = Number(user?.id ?? 0);
    if (!myId) return;

    const videoEnabled = overrides?.videoEnabled ?? (get().cameraActive || get().screenSharing);
    const micEnabled = overrides?.micEnabled ?? get().micActive;

    Object.keys(pcs).forEach((peerIdStr) => {
      const peerId = Number(peerIdStr);
      if (!Number.isFinite(peerId) || !peerId) return;
      
      channel.whisper('meeting-signal', {
        to: peerId,
        from: myId,
        media: { videoEnabled, micEnabled }
      });
    });
  };

  const renegotiate = async (peerId: number) => {
    const pc = pcs[peerId];
    if (!pc || pc.signalingState === 'closed') return;
    if (pc.signalingState !== 'stable') return;
    
    try {
      const user = useAuthStore.getState().user;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      presenceChannel?.whisper('meeting-signal', {
        to: peerId,
        from: user?.id,
        offer: offer
      });
    } catch (e) {
      console.error('[WebRTC] Renegotiate createOffer error:', e);
    }
  };

  const attemptRenegotiate = (peerId: number) => {
    const pc = pcs[peerId];
    if (!pc || pc.signalingState === 'closed') return;

    if (pc.signalingState === 'stable') {
      renegotiateAttempt[peerId] = 0;
      void renegotiate(peerId);
      return;
    }

    const tries = (renegotiateAttempt[peerId] || 0) + 1;
    renegotiateAttempt[peerId] = tries;
    if (tries > 12) {
      renegotiateAttempt[peerId] = 0;
      return;
    }

    window.setTimeout(() => attemptRenegotiate(peerId), 250);
  };

  const scheduleRenegotiation = () => {
    if (renegotiateTimer) {
      window.clearTimeout(renegotiateTimer);
    }
    renegotiateTimer = window.setTimeout(() => {
      const user = useAuthStore.getState().user;
      const myId = Number(user?.id ?? 0);
      Object.keys(pcs).forEach((peerIdStr) => {
        const peerId = Number(peerIdStr);
        if (!Number.isFinite(peerId) || !peerId) return;

        if (myId && myId < peerId) {
          attemptRenegotiate(peerId);
        } else {
          presenceChannel?.whisper('meeting-signal', {
            to: peerId,
            from: user?.id,
            renegotiate: true
          });
        }
      });
    }, 150);
  };

  const initiatePeerConnection = async (peerId: number, isInitiator: boolean, meteredServers: RTCIceServer[] = []) => {
    if (pcs[peerId]) {
      return pcs[peerId];
    }

    const user = useAuthStore.getState().user;
    const pc = new RTCPeerConnection({ iceServers: meteredServers });
    pcs[peerId] = pc;

    if (localStreamInstance) {
      localStreamInstance.getTracks().forEach(track => {
        pc.addTrack(track, localStreamInstance!);
      });
    }

    if (!localStreamInstance || localStreamInstance.getAudioTracks().length === 0) {
      pc.addTransceiver('audio', { direction: 'sendrecv' });
    }

    videoTransceivers[peerId] = pc.addTransceiver('video', { direction: 'sendrecv' });

    let candidateTimeout: any = null;
    let candidateBatch: any[] = [];

    pc.onicecandidate = (event) => {
      if (event.candidate && presenceChannel) {
        candidateBatch.push(event.candidate);
        if (candidateTimeout) clearTimeout(candidateTimeout);
        candidateTimeout = setTimeout(() => {
          const batch = [...candidateBatch];
          candidateBatch = [];
          if (batch.length > 0) {
            presenceChannel.whisper('meeting-signal', {
              to: peerId,
              from: user?.id,
              candidates: batch
            });
          }
        }, 100);
      }
    };

    pc.ontrack = (event) => {
      set(state => {
        const existingStream = state.remoteStreams[peerId] || new MediaStream();
        if (!existingStream.getTracks().find(t => t.id === event.track.id)) {
          existingStream.addTrack(event.track);
        }
        return {
          remoteStreams: {
            ...state.remoteStreams,
            [peerId]: existingStream
          }
        };
      });

      event.track.onended = () => {
        if (event.track.kind === 'video') {
          set(state => ({ peerVideoActive: { ...state.peerVideoActive, [peerId]: false } }));
        }
      };

      event.track.onmute = () => {
        if (event.track.kind === 'video') {
          set(state => ({ peerVideoActive: { ...state.peerVideoActive, [peerId]: false } }));
        }
      };

      event.track.onunmute = () => {
        if (event.track.kind === 'video') {
          set(state => ({ peerVideoActive: { ...state.peerVideoActive, [peerId]: true } }));
        }
      };

      if (event.track.kind === 'video') {
        set(state => ({ peerVideoActive: { ...state.peerVideoActive, [peerId]: true } }));
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        pc.restartIce();
      }
    };

    if (isInitiator && user?.id) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        presenceChannel?.whisper('meeting-signal', {
          to: peerId,
          from: user.id,
          offer: offer
        });
      } catch (e) {
        console.error('[WebRTC] Initiator offer failed:', e);
      }
    }

    return pc;
  };

  const cleanupWebRTC = () => {
    if (localStreamInstance) {
      localStreamInstance.getTracks().forEach(track => track.stop());
      localStreamInstance = null;
    }
    if (screenStreamInstance) {
      screenStreamInstance.getTracks().forEach(track => track.stop());
      screenStreamInstance = null;
    }

    Object.keys(pcs).forEach(peerId => {
      const pc = pcs[Number(peerId)];
      if (pc) {
        pc.close();
      }
    });
    pcs = {};
    videoTransceivers = {};
    
    if (recordingTimer) clearInterval(recordingTimer);
    if (elapsedTimer) clearInterval(elapsedTimer);
    recordingTimer = null;
    elapsedTimer = null;

    set({
      meetingId: null,
      meeting: null,
      localStream: null,
      remoteStreams: {},
      activeMembers: [],
      messages: [],
      micActive: true,
      cameraActive: false,
      screenSharing: false,
      recording: false,
      recordingDuration: 0,
      meetingElapsedSec: 0,
      durationLimitReached: false,
    });
  };

  return {
    meetingId: null,
    meeting: null,
    minimized: false,
    micActive: true,
    cameraActive: false,
    screenSharing: false,
    localStream: null,
    remoteStreams: {},
    activeMembers: [],
    messages: [],
    audioBlocked: false,

    audioInputs: [],
    videoInputs: [],
    audioOutputs: [],

    selectedMicId: localStorage.getItem('tt-mic-device') || '',
    selectedCamId: localStorage.getItem('tt-cam-device') || '',
    selectedSpeakerId: localStorage.getItem('tt-speaker-device') || '',

    peerVideoEnabled: {},
    peerMicEnabled: {},
    peerVideoActive: {},

    recording: false,
    recordingDuration: 0,
    meetingElapsedSec: 0,
    durationLimitReached: false,
    showDeviceSettings: false,

    initRoom: async (id: number) => {
      // If already initialized for this room, do not re-run
      if (get().meetingId === id) return;

      // Clean up previous meeting if any
      if (get().meetingId) {
        cleanupWebRTC();
      }

      set({ meetingId: id });

      // Request media permissions & load initial devices
      await get().refreshDevices();

      // Acquire microphone
      try {
        const micId = get().selectedMicId;
        const constraints = micId
          ? { audio: { deviceId: { exact: micId } }, video: false }
          : { audio: true, video: false };
        localStreamInstance = await navigator.mediaDevices.getUserMedia(constraints);
        set({ localStream: localStreamInstance });
      } catch (err) {
        console.warn('[Store] Microphone access failed. Listening-only mode.', err);
        localStreamInstance = new MediaStream();
        set({ localStream: localStreamInstance });
      }

      // Load Meeting Details & Chat Messages
      try {
        const detailRes = await meetingsAPI.getMeetingDetails(id);
        if (detailRes.success) {
          const m = detailRes.data as Meeting;
          set({ meeting: m });

          // Mark joined on backend
          await meetingsAPI.joinMeeting(id);

          const startedAtMs = m.started_at ? Date.parse(m.started_at) : Date.now();
          set({ meetingElapsedSec: (Date.now() - startedAtMs) / 1000 });

          // Start duration timer ticker
          if (elapsedTimer) clearInterval(elapsedTimer);
          elapsedTimer = setInterval(() => {
            const currentMeeting = get().meeting;
            if (!currentMeeting) return;

            const startedMs = currentMeeting.started_at ? Date.parse(currentMeeting.started_at) : Date.now();
            const elapsedSec = (Date.now() - startedMs) / 1000;
            set({ meetingElapsedSec: elapsedSec });

            // Duration Warning Logic
            const limitMinutes = currentMeeting.duration_minutes;
            const user = useAuthStore.getState().user;
            const isHostOrAdmin = currentMeeting.created_by === user?.id || user?.role === 'admin';

            if (isHostOrAdmin && limitMinutes > 0 && (elapsedSec >= limitMinutes * 60)) {
              if (!get().durationLimitReached) {
                set({ durationLimitReached: true });
              }
            } else {
              if (get().durationLimitReached) {
                set({ durationLimitReached: false });
              }
            }
          }, 1000);
        }

        const messagesRes = await meetingsAPI.getMeetingMessages(id);
        if (messagesRes.success) {
          set({ messages: messagesRes.data });
        }
      } catch (err) {
        toast.error('Failed to load meeting details.');
        cleanupWebRTC();
        return;
      }

      // Fetch TURN servers
      let meteredServers: RTCIceServer[] = [];
      try {
        const turnRes = await voiceAPI.getIceServers();
        if (turnRes.success && Array.isArray(turnRes.iceServers)) {
          meteredServers = turnRes.iceServers as unknown as RTCIceServer[];
        }
      } catch (e) {
        console.warn('[Store] Could not retrieve TURN servers, using browser default STUN.');
      }

      // Echo Connections
      const user = useAuthStore.getState().user;
      const echo = getEcho();
      echoInstance = echo;
      
      const presenceChannelName = `presence-meeting.${id}`;
      const userPrivateChannelName = `App.Models.User.${user?.id}`;

      presenceChannel = echo.join(presenceChannelName);

      presenceChannel
        .here((usersList: Array<{ id: number; name: string; role: string }>) => {
          set({ activeMembers: usersList });
          usersList.forEach(async (member) => {
            if (Number(member.id) !== Number(user?.id)) {
              const isInitiator = Number(user?.id ?? 0) < Number(member.id);
              await initiatePeerConnection(member.id, isInitiator, meteredServers);
            }
          });
          broadcastMediaState();
        })
        .joining(async (joiningUser: { id: number; name: string; role: string }) => {
          set(state => {
            if (state.activeMembers.some(m => m.id === joiningUser.id)) return state;
            return { activeMembers: [...state.activeMembers, joiningUser] };
          });
          toast.info(`${joiningUser.name} joined the meeting room`);

          if (Number(joiningUser.id) !== Number(user?.id)) {
            const isInitiator = Number(user?.id ?? 0) < Number(joiningUser.id);
            await initiatePeerConnection(joiningUser.id, isInitiator, meteredServers);
          }
          broadcastMediaState();
        })
        .leaving((leavingUser: { id: number; name: string; role: string }) => {
          set(state => ({ activeMembers: state.activeMembers.filter(m => m.id !== leavingUser.id) }));

          const pc = pcs[leavingUser.id];
          if (pc) {
            pc.close();
            delete pcs[leavingUser.id];
          }
          if (videoTransceivers[leavingUser.id]) {
            delete videoTransceivers[leavingUser.id];
          }
          set(state => {
            const copy = { ...state.remoteStreams };
            delete copy[leavingUser.id];
            return { remoteStreams: copy };
          });

          toast.info(`${leavingUser.name} left the meeting room`);
        })
        .listen('.new.meeting.message', (e: { message: MeetingMessage }) => {
          set(state => {
            if (state.messages.some(m => m.id === e.message.id)) return state;
            return { messages: [...state.messages, e.message] };
          });
        })
        .listen('.meeting.ended', () => {
          toast.warning('The host has ended this meeting.');
          cleanupWebRTC();
        });

      const pendingCandidates: Record<number, any[]> = {};

      presenceChannel.listenForWhisper('meeting-signal', async (data: any) => {
        if (Number(data.to) !== Number(user?.id)) return;

        const peerId = data.from;
        let pc = pcs[peerId];
        if (!pc) {
          pc = await initiatePeerConnection(peerId, false, meteredServers);
        }

        try {
          if (data.media) {
            if (typeof data.media.videoEnabled === 'boolean') {
              set(state => ({ peerVideoEnabled: { ...state.peerVideoEnabled, [peerId]: data.media.videoEnabled } }));
            }
            if (typeof data.media.micEnabled === 'boolean') {
              set(state => ({ peerMicEnabled: { ...state.peerMicEnabled, [peerId]: data.media.micEnabled } }));
            }
          }

          if (data.renegotiate) {
            const myId = Number(user?.id ?? 0);
            if (myId && myId < peerId) {
              attemptRenegotiate(peerId);
            }
            return;
          }

          if (data.offer) {
            if (data.offer.sdp) data.offer.sdp = sanitizeSdp(data.offer.sdp);
            if (pc.signalingState !== 'stable') {
              if (pc.signalingState === 'have-local-offer') {
                try {
                  await pc.setLocalDescription({ type: 'rollback' } as any);
                } catch (e) { /* ignore rollback failures */ }
              }
            }
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            
            const queued = pendingCandidates[peerId] || [];
            for (const c of queued) {
              await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => void 0);
            }
            pendingCandidates[peerId] = [];

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            presenceChannel?.whisper('meeting-signal', {
              to: peerId,
              from: user?.id,
              answer: answer
            });
          } else if (data.answer) {
            if (data.answer.sdp) data.answer.sdp = sanitizeSdp(data.answer.sdp);
            if (pc.signalingState === 'stable') return;
            if (pc.remoteDescription?.type === 'answer') return;

            const localType = pc.localDescription?.type;
            if (pc.signalingState !== 'have-local-offer' || localType !== 'offer') return;

            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            
            const queued = pendingCandidates[peerId] || [];
            for (const c of queued) {
              await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => void 0);
            }
            pendingCandidates[peerId] = [];
          } else if (data.candidates) {
            for (const cand of data.candidates) {
              if (pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => void 0);
              } else {
                if (!pendingCandidates[peerId]) pendingCandidates[peerId] = [];
                pendingCandidates[peerId].push(cand);
              }
            }
          }
        } catch (err) {
          console.error('[WebRTC] Signaling message handle error:', err);
        }
      });

      // Private User Channel for meeting status updates (e.g. invite, ended, extension)
      privateChannel = echo.private(userPrivateChannelName);
      privateChannel.listen('.meeting.ended', (e: { meeting: Meeting }) => {
        if (e.meeting.id === get().meetingId) {
          toast.warning('The host has ended this meeting.');
          cleanupWebRTC();
        }
      });
      privateChannel.listen('meeting.started', (e: { meeting: Meeting }) => {
        if (e.meeting.id === get().meetingId) {
          set({ meeting: e.meeting, durationLimitReached: false });
        }
      });
    },

    leaveRoom: async () => {
      const id = get().meetingId;
      if (!id) return;
      try {
        await meetingsAPI.leaveMeeting(id);
      } catch (e) {
        console.warn('Failed to register leave on server:', e);
      }
      
      if (echoInstance) {
        echoInstance.leave(`presence-meeting.${id}`);
        if (privateChannel) {
          privateChannel.stopListening('.meeting.ended');
          privateChannel.stopListening('meeting.started');
        }
      }

      cleanupWebRTC();
      set({ minimized: false });
    },

    endRoom: async () => {
      const id = get().meetingId;
      if (!id) return;
      try {
        await meetingsAPI.endMeeting(id);
      } catch (e) {
        toast.error('Failed to end meeting.');
      }
      
      if (echoInstance) {
        echoInstance.leave(`presence-meeting.${id}`);
        if (privateChannel) {
          privateChannel.stopListening('.meeting.ended');
          privateChannel.stopListening('meeting.started');
        }
      }

      cleanupWebRTC();
      set({ minimized: false });
    },

    toggleMic: () => {
      const active = !get().micActive;
      set({ micActive: active });
      if (localStreamInstance) {
        localStreamInstance.getAudioTracks().forEach(track => {
          track.enabled = active;
        });
      }
      broadcastMediaState({ micEnabled: active });
    },

    toggleCamera: async () => {
      const active = !get().cameraActive;
      if (active) {
        if (get().screenSharing) {
          get().stopScreenShare();
        }

        try {
          const camId = get().selectedCamId;
          const constraints = camId
            ? { video: { width: 1280, height: 720, deviceId: { exact: camId } }, audio: false }
            : { video: { width: 1280, height: 720 }, audio: false };
          
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          const videoTrack = stream.getVideoTracks()[0];
          
          if (localStreamInstance) {
            localStreamInstance.getVideoTracks().forEach(t => {
              localStreamInstance?.removeTrack(t);
              t.stop();
            });
            localStreamInstance.addTrack(videoTrack);
          }

          Object.entries(pcs).forEach(([peerId, pc]) => {
            const pid = Number(peerId);
            const transceiver = (videoTransceivers[pid] || pc.getSenders().find(s => s.track?.kind === 'video')) as any;
            if (transceiver) {
              const sender = transceiver.sender || transceiver;
              sender.replaceTrack(videoTrack).catch(() => void 0);
              if (transceiver.direction) transceiver.direction = 'sendrecv';
            }
          });

          set({ cameraActive: true, localStream: localStreamInstance });
          scheduleRenegotiation();
          broadcastMediaState({ videoEnabled: true });
        } catch (e) {
          console.error('[WebRTC] Camera start failed:', e);
          toast.error('Could not access camera.');
          set({ cameraActive: false });
        }
      } else {
        if (localStreamInstance) {
          localStreamInstance.getVideoTracks().forEach(track => {
            localStreamInstance?.removeTrack(track);
            track.stop();
          });
        }
        
        Object.entries(pcs).forEach(([peerId, pc]) => {
          const pid = Number(peerId);
          const transceiver = (videoTransceivers[pid] || pc.getSenders().find(s => s.track?.kind === 'video')) as any;
          if (transceiver) {
            const sender = transceiver.sender || transceiver;
            sender.replaceTrack(null).catch(() => void 0);
            if (transceiver.direction) transceiver.direction = 'recvonly';
          }
        });

        set({ cameraActive: false, localStream: localStreamInstance });
        scheduleRenegotiation();
        broadcastMediaState({ videoEnabled: false });
      }
    },

    toggleScreenShare: async () => {
      if (get().screenSharing) {
        get().stopScreenShare();
      } else {
        try {
          if (get().cameraActive) {
            set({ cameraActive: false });
            if (localStreamInstance) {
              localStreamInstance.getVideoTracks().forEach(track => {
                localStreamInstance?.removeTrack(track);
                track.stop();
              });
            }
          }

          const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
          screenStreamInstance = stream;
          set({ screenSharing: true });

          const videoTrack = stream.getVideoTracks()[0];
          videoTrack.onended = () => {
            get().stopScreenShare();
          };

          if (localStreamInstance) {
            localStreamInstance.getVideoTracks().forEach(t => {
              localStreamInstance?.removeTrack(t);
              t.stop();
            });
            localStreamInstance.addTrack(videoTrack);
          }

          Object.entries(pcs).forEach(([peerId, pc]) => {
            const pid = Number(peerId);
            const transceiver = (videoTransceivers[pid] || pc.getSenders().find(s => s.track?.kind === 'video')) as any;
            if (transceiver) {
              const sender = transceiver.sender || transceiver;
              sender.replaceTrack(videoTrack).catch(() => void 0);
              if (transceiver.direction) transceiver.direction = 'sendrecv';
            }
          });

          set({ localStream: localStreamInstance });
          scheduleRenegotiation();
          broadcastMediaState({ videoEnabled: true });
        } catch (e) {
          console.error('[WebRTC] Screen share failed:', e);
          toast.error('Could not share screen.');
          set({ screenSharing: false });
        }
      }
    },

    stopScreenShare: () => {
      if (screenStreamInstance) {
        screenStreamInstance.getTracks().forEach(track => track.stop());
        screenStreamInstance = null;
      }
      set({ screenSharing: false });

      if (localStreamInstance) {
        localStreamInstance.getVideoTracks().forEach(track => {
          localStreamInstance?.removeTrack(track);
          track.stop();
        });
      }

      Object.entries(pcs).forEach(([peerId, pc]) => {
        const pid = Number(peerId);
        const transceiver = (videoTransceivers[pid] || pc.getSenders().find(s => s.track?.kind === 'video')) as any;
        if (transceiver) {
          const sender = transceiver.sender || transceiver;
          sender.replaceTrack(null).catch(() => void 0);
          if (transceiver.direction) transceiver.direction = 'recvonly';
        }
      });

      set({ localStream: localStreamInstance });
      scheduleRenegotiation();
      broadcastMediaState({ videoEnabled: false });
    },

    switchMicrophone: async (deviceId: string) => {
      localStorage.setItem('tt-mic-device', deviceId);
      set({ selectedMicId: deviceId });

      try {
        const constraints = deviceId
          ? { audio: { deviceId: { exact: deviceId } }, video: false }
          : { audio: true, video: false };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        const newTrack = stream.getAudioTracks()[0];
        if (!newTrack) return;
        newTrack.enabled = get().micActive;

        if (localStreamInstance) {
          localStreamInstance.getAudioTracks().forEach(t => {
            localStreamInstance?.removeTrack(t);
            t.stop();
          });
          localStreamInstance.addTrack(newTrack);
        }

        Object.values(pcs).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
          if (sender) {
            sender.replaceTrack(newTrack).catch(() => void 0);
          } else {
            pc.addTrack(newTrack, localStreamInstance!);
          }
        });

        set({ localStream: localStreamInstance });
        scheduleRenegotiation();
        await get().refreshDevices();
      } catch (err) {
        toast.error('Could not switch microphone.');
      }
    },

    switchCameraDevice: async (deviceId: string) => {
      localStorage.setItem('tt-cam-device', deviceId);
      set({ selectedCamId: deviceId });
      if (get().cameraActive) {
        // Toggle camera off and on to restart with new device
        await get().toggleCamera();
        await get().toggleCamera();
      }
      await get().refreshDevices();
    },

    switchSpeaker: async (deviceId: string) => {
      localStorage.setItem('tt-speaker-device', deviceId);
      set({ selectedSpeakerId: deviceId });

      document.querySelectorAll('audio, video').forEach(async (el) => {
        const anyEl = el as any;
        if (typeof anyEl.setSinkId === 'function') {
          try {
            await anyEl.setSinkId(deviceId);
          } catch (e) {
            console.error('Failed to set speaker output sink ID:', e);
          }
        }
      });
      await get().refreshDevices();
    },

    refreshDevices: async () => {
      if (!('mediaDevices' in navigator) || !navigator.mediaDevices?.enumerateDevices) return;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        set({
          audioInputs: devices.filter(d => d.kind === 'audioinput'),
          videoInputs: devices.filter(d => d.kind === 'videoinput'),
          audioOutputs: devices.filter(d => d.kind === 'audiooutput'),
        });
      } catch (e) {
        console.warn('Could not enumerate media devices:', e);
      }
    },

    requestPermissions: async () => {
      if (!navigator.mediaDevices?.getUserMedia) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        stream.getTracks().forEach(t => t.stop());
        await get().refreshDevices();
      } catch (e) {
        toast.error('Media devices permission denied.');
      }
    },

    setAudioBlocked: (blocked: boolean) => set({ audioBlocked: blocked }),
    setShowDeviceSettings: (show: boolean) => set({ showDeviceSettings: show }),
    setMinimized: (minimized: boolean) => set({ minimized }),

    sendMessage: async (messageText: string) => {
      const id = get().meetingId;
      if (!id) return;
      try {
        const res = await meetingsAPI.sendMeetingMessage(id, messageText);
        if (res.success) {
          set(state => {
            if (state.messages.some(m => m.id === res.data.id)) return state;
            return { messages: [...state.messages, res.data] };
          });
        }
      } catch (err) {
        toast.error('Failed to send message');
      }
    },

    startRecording: async () => {
      if (get().recording) return;
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });

        recordingChunks = [];
        let mediaRecorder: MediaRecorder;
        
        try {
          mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus' });
        } catch (e) {
          mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        }

        mediaRecorderInstance = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            recordingChunks.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(recordingChunks, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = `meeting-record-${get().meeting?.title ?? 'recording'}-${Date.now()}.webm`;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
          }, 100);

          stream.getTracks().forEach(t => t.stop());

          set({ recording: false, recordingDuration: 0 });
          if (recordingTimer) {
            clearInterval(recordingTimer);
            recordingTimer = null;
          }
          toast.success('Meeting recording saved and downloaded.');
        };

        mediaRecorder.start(1000);
        set({ recording: true, recordingDuration: 0 });

        recordingTimer = setInterval(() => {
          set(state => ({ recordingDuration: state.recordingDuration + 1 }));
        }, 1000);

        stream.getVideoTracks()[0].onended = () => {
          get().stopRecording();
        };
      } catch (err) {
        console.error('Failed to start recording:', err);
        toast.error('Could not start recording. Screen share permission required.');
      }
    },

    stopRecording: () => {
      if (mediaRecorderInstance && mediaRecorderInstance.state !== 'inactive') {
        mediaRecorderInstance.stop();
      }
    },

    extendMeeting: async (minutes: number) => {
      const id = get().meetingId;
      if (!id) return;
      try {
        const res = await meetingsAPI.extendMeeting(id, minutes);
        if (res.success) {
          toast.success(`Meeting duration extended by ${minutes} minutes.`);
          set({ durationLimitReached: false });
        }
      } catch (err) {
        toast.error('Failed to extend meeting.');
      }
    },

    dismissDurationWarning: () => {
      set({ durationLimitReached: false });
    }
  };
});
