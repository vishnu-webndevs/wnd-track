import { create } from 'zustand';
import { voiceAPI } from '../api/voice';
import { getEcho } from '../lib/echo';
import { ringtone } from '../utils/ringtone';
import { toast } from 'sonner';

export type CallState = 'idle' | 'calling' | 'incoming' | 'connected';

//#region debug-point voice-call-no-audio:reporter
const getVoiceDebugConfig = () => {
  const metaEnv = (import.meta as any)?.env || {};
  const enabled =
    String(metaEnv.VITE_DEBUG_VOICE ?? '') === '1' ||
    localStorage.getItem('tt-debug-voice') === '1';
  const url =
    metaEnv.VITE_DEBUG_SERVER_URL ||
    metaEnv.VITE_TRAE_DEBUG_SERVER_URL ||
    localStorage.getItem('DEBUG_SERVER_URL') ||
    'http://10.67.238.91:7777/event';
  const session =
    metaEnv.VITE_DEBUG_SESSION_ID ||
    metaEnv.VITE_TRAE_DEBUG_SESSION_ID ||
    localStorage.getItem('DEBUG_SESSION_ID') ||
    'voice-call-no-audio';

  return { enabled, url: String(url), session: String(session) };
};

const voiceDebugReport = (point: string, payload: Record<string, any>) => {
  try {
    const { enabled, url, session } = getVoiceDebugConfig();
    if (!enabled) return;
    const event = {
      sessionId: session,
      ts: Date.now(),
      point,
      payload
    };

    try {
      const w = window as any;
      const buf: any[] = Array.isArray(w.__tt_voice_debug) ? w.__tt_voice_debug : [];
      buf.push(event);
      if (buf.length > 800) buf.splice(0, buf.length - 800);
      w.__tt_voice_debug = buf;
    } catch {
      // ignore
    }
    const body = JSON.stringify(event);

    const navAny = navigator as any;
    if (typeof navAny?.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      navAny.sendBeacon(url, blob);
      return;
    }

    void fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain' },
      body
    }).catch(() => {});
  } catch {
    // ignore
  }
};
//#endregion

interface VoiceState {
  callState: CallState;
  sessionId: string | null;
  callerId: number | null;
  callerName: string | null;
  recipientId: number | null;
  recipientName: string | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isSpeakerOn: boolean;
  isInitiator: boolean;
  remoteAccepted: boolean;
  offerSent: boolean;
  debugRunId: string | null;
  
  // WebRTC
  pc: RTCPeerConnection | null;
  echoChannel: any | null;
  pendingCandidates: RTCIceCandidateInit[];
  cachedIceServers: any[] | null;

  initiateCall: (recipientId: number, recipientName: string) => Promise<void>;
  receiveCall: (sessionId: string, callerId: number, callerName: string) => void;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  switchMicrophone: (deviceId: string) => Promise<void>;
  
  // Internal Setters
  setCallState: (callState: CallState) => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  setupWebRTC: (sessionId: string, isInitiator: boolean) => Promise<void>;
  resetCall: () => void;
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  callState: 'idle',
  sessionId: null,
  callerId: null,
  callerName: null,
  recipientId: null,
  recipientName: null,
  localStream: null,
  remoteStream: null,
  isMuted: false,
  isSpeakerOn: true,
  isInitiator: false,
  remoteAccepted: false,
  offerSent: false,
  debugRunId: null,
  pc: null,
  echoChannel: null,
  pendingCandidates: [],
  cachedIceServers: null,

  setCallState: (callState) => set({ callState }),
  setRemoteStream: (remoteStream) => set({ remoteStream }),

  initiateCall: async (recipientId, recipientName) => {
    try {
      // Generate session ID upfront to subscribe BEFORE the receiver gets the call
      const sessionId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
      
      set({ callState: 'calling', recipientId, recipientName, sessionId, isMuted: false, remoteAccepted: false, offerSent: false });
      ringtone.startOutgoing();
      
      // Setup WebRTC and listen to signaling channel FIRST
      await get().setupWebRTC(sessionId, true);

      // Wait a tiny bit to ensure Echo subscription is active
      await new Promise(r => setTimeout(r, 300));

      // Now tell the backend to ring the receiver
      const res = await voiceAPI.initiateCall(recipientId, 'voice', sessionId);
      if (!res.success) {
        throw new Error('Call initiation failed on server');
      }
    } catch (e) {
      voiceDebugReport('voice.initiate.error', {
        message: (e as any)?.message ? String((e as any).message) : String(e),
      });
      get().resetCall();
    }
  },

  receiveCall: (sessionId, callerId, callerName) => {
    // Only accept call if idle
    if (get().callState !== 'idle') {
      // Send end Call to clear for the caller
      voiceAPI.endCall(sessionId).catch(() => {});
      return;
    }
    set({ callState: 'incoming', sessionId, callerId, callerName, remoteAccepted: false, offerSent: false });
    ringtone.startIncoming();
  },

  acceptCall: async () => {
    const { sessionId } = get();
    if (!sessionId) return;

    try {
      ringtone.stop();
      set({ callState: 'connected' });
      voiceAPI.sendSignal(sessionId, { accepted: true }).catch(() => {});
      await get().setupWebRTC(sessionId, false);
    } catch (e) {
      voiceDebugReport('voice.accept.error', {
        message: (e as any)?.message ? String((e as any).message) : String(e),
      });
      get().endCall();
    }
  },

  rejectCall: () => {
    ringtone.stop();
    const { sessionId } = get();
    get().resetCall();
    if (sessionId) {
      voiceAPI.endCall(sessionId).catch(() => {});
    }
  },

  endCall: async () => {
    const { sessionId } = get();
    get().resetCall(); // Optimistically reset UI instantly
    if (sessionId) {
      try {
        await voiceAPI.endCall(sessionId);
      } catch (e) {
        // ignore
      }
    }
  },

  toggleMute: () => {
    const { localStream, isMuted } = get();
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = isMuted; // enable if it was muted
      });
      set({ isMuted: !isMuted });
    }
  },

  toggleSpeaker: () => {
    set(state => ({ isSpeakerOn: !state.isSpeakerOn }));
  },

  switchMicrophone: async (deviceId: string) => {
    localStorage.setItem('tt-mic-device', deviceId);

    const { pc, localStream, isMuted } = get();
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Microphone not supported in this browser.');
      return;
    }

    try {
      const constraints: MediaStreamConstraints = deviceId
        ? { audio: { deviceId: { exact: deviceId } }, video: false }
        : { audio: true, video: false };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const newTrack = stream.getAudioTracks()[0];
      if (!newTrack) {
        toast.error('No microphone track found.');
        return;
      }
      newTrack.enabled = !isMuted;

      const current = localStream || new MediaStream();
      current.getAudioTracks().forEach(t => {
        current.removeTrack(t);
        t.stop();
      });
      current.addTrack(newTrack);
      set({ localStream: current });

      if (pc && pc.signalingState !== 'closed') {
        const transceiver = pc.getTransceivers().find(t =>
          (t.sender && (t.sender.track?.kind === 'audio' || t.sender.track === null)) ||
          (t.receiver && t.receiver.track?.kind === 'audio')
        );

        if (transceiver?.sender) {
          try { transceiver.direction = 'sendrecv'; } catch { /* ignore */ }
          await transceiver.sender.replaceTrack(newTrack);
        } else {
          pc.addTrack(newTrack, current);
        }
      }
    } catch (err: any) {
      const errName = err?.name ? String(err.name) : '';
      const secureHint = window.isSecureContext ? '' : ' (HTTPS/localhost required)';
      const msg =
        errName === 'NotFoundError'
          ? 'No microphone device found.'
          : errName === 'NotAllowedError' || errName === 'SecurityError'
            ? `Microphone access blocked${secureHint}.`
            : `Could not switch microphone${secureHint}.`;
      toast.error(msg);
    }
  },

  // INTERNAL WEBRTC HELPER
  setupWebRTC: async (sessionId: string, isInitiator: boolean) => {
    try {
      const runId = `${sessionId}:${isInitiator ? 'initiator' : 'receiver'}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
      set({ isInitiator, debugRunId: runId });

      //#region debug-point voice-call-no-audio:helpers
      const summarizeSdp = (sdp?: string | null) => {
        if (!sdp) return { has: false, mKinds: [] as string[], mids: [] as string[] };
        const lines = sdp.split(/\r\n|\n/);
        const mKinds: string[] = [];
        const mids: string[] = [];
        for (const line of lines) {
          if (line.startsWith('m=')) {
            const parts = line.slice(2).split(' ');
            if (parts[0]) mKinds.push(parts[0]);
          }
          if (line.startsWith('a=mid:')) {
            mids.push(line.slice('a=mid:'.length));
          }
        }
        return { has: true, mKinds, mids };
      };

      const summarizePc = (pc: RTCPeerConnection) => ({
        signalingState: pc.signalingState,
        iceConnectionState: pc.iceConnectionState,
        connectionState: (pc as any).connectionState ?? null,
        iceGatheringState: pc.iceGatheringState,
        localDescription: pc.localDescription ? { type: pc.localDescription.type, ...summarizeSdp(pc.localDescription.sdp) } : null,
        remoteDescription: pc.remoteDescription ? { type: pc.remoteDescription.type, ...summarizeSdp(pc.remoteDescription.sdp) } : null,
        transceivers: pc.getTransceivers().map(t => ({
          mid: t.mid ?? null,
          direction: t.direction,
          currentDirection: (t as any).currentDirection ?? null,
          senderTrack: t.sender?.track ? { kind: t.sender.track.kind, id: t.sender.track.id, enabled: t.sender.track.enabled, muted: (t.sender.track as any).muted ?? null, readyState: t.sender.track.readyState } : null,
          receiverTrack: t.receiver?.track ? { kind: t.receiver.track.kind, id: t.receiver.track.id, muted: (t.receiver.track as any).muted ?? null, readyState: t.receiver.track.readyState } : null
        }))
      });

      const report = (point: string, payload: Record<string, any>) => {
        voiceDebugReport(point, { runId, sessionId, isInitiator, ...payload });
      };
      //#endregion

      report('voice.webrtc.start', {});

      // 1. Subscribe to signaling channel IMMEDIATELY so we don't miss any fast responses
      const echo = getEcho();
      const channel = echo.private(`voice.${sessionId}`);
      set({ echoChannel: channel });

      report('voice.echo.subscribed', {});

      // 2. Get ICE servers (with caching)
      let iceServers = get().cachedIceServers;
      
      const iceRes = iceServers 
        ? { iceServers } 
        : await voiceAPI.getIceServers().catch(e => {
            report('voice.ice.fetch.error', {
              message: (e as any)?.message ? String((e as any).message) : String(e),
            });
            return { iceServers: [] };
          });
      
      if (!iceServers) {
        iceServers = iceRes.iceServers || [];
        useVoiceStore.setState({ cachedIceServers: iceServers });
      }

      // 3. Create peer connection early (before mic prompt) so offers/answers can flow instantly
      const pc = new RTCPeerConnection({ iceServers });
      set({ pc });

      const remoteMediaStream = new MediaStream();
      pc.ontrack = (event) => {
        report('voice.pc.ontrack', {
          kind: event.track.kind,
          id: event.track.id,
          readyState: event.track.readyState,
          muted: (event.track as any).muted ?? null,
          pc: summarizePc(pc),
        });
        if (!remoteMediaStream.getTracks().find(t => t.id === event.track.id)) {
          remoteMediaStream.addTrack(event.track);
        }
        set({ remoteStream: remoteMediaStream });
      };

      const audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });

      // 4. Setup signaling listener ASAP
      channel.listen('.voice.signal', async (data: { sender_id: number; signal: any }) => {
        if (pc.signalingState === 'closed') return;

        const userStr = localStorage.getItem('user');
        if (userStr) {
          try {
            const me = JSON.parse(userStr);
            if (me.id === data.sender_id) return;
          } catch { /* ignore */ }
        }

        const { signal } = data;

        const sanitizeSdp = (sdp: string) => {
          if (!sdp) return sdp;
          const lines = sdp.split(/\r\n|\n/);
          const rebuilt = lines.join('\r\n').trim();
          return rebuilt ? `${rebuilt}\r\n` : rebuilt;
        };

        try {
          report('voice.signal.recv', {
            senderId: data.sender_id,
            keys: signal ? Object.keys(signal) : [],
            pc: summarizePc(pc),
          });

          if (signal.accepted && isInitiator) {
            set({ remoteAccepted: true });
            ringtone.stop();
            report('voice.signal.accepted', { pc: summarizePc(pc) });
            return;
          }

          if (signal.ready && isInitiator) {
            const { offerSent } = get();
            if (offerSent) return;
            if (pc.signalingState !== 'stable') return;
            const offer = await pc.createOffer({ offerToReceiveAudio: true });
            await pc.setLocalDescription(offer);
            set({ offerSent: true });
            await voiceAPI.sendSignal(sessionId, { offer }).catch(() => {});
            report('voice.signal.offer.sent', {
              offer: { type: offer.type, ...summarizeSdp(offer.sdp) },
              pc: summarizePc(pc),
            });
            return;
          }

          if (signal.offer) {
            if (signal.offer.sdp) signal.offer.sdp = sanitizeSdp(signal.offer.sdp);
            report('voice.signal.offer.recv', {
              offer: { type: signal.offer.type, ...summarizeSdp(signal.offer.sdp) },
              pc: summarizePc(pc),
            });
            if (pc.signalingState !== 'stable') {
              if (pc.signalingState === 'have-local-offer') {
                try { await pc.setLocalDescription({ type: 'rollback' } as any); } catch { /* ignore */ }
              }
            }
            await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
            report('voice.signal.offer.applied', { pc: summarizePc(pc) });

            const { pendingCandidates } = get();
            for (const c of pendingCandidates) {
              await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
            }
            set({ pendingCandidates: [] });

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await voiceAPI.sendSignal(sessionId, { answer }).catch(() => {});
            report('voice.signal.answer.sent', {
              answer: { type: answer.type, ...summarizeSdp(answer.sdp) },
              pc: summarizePc(pc),
            });
            ringtone.stop();
            set({ callState: 'connected' });
            return;
          }

          if (signal.answer) {
            if (pc.signalingState === 'stable') return;
            if (signal.answer.sdp) signal.answer.sdp = sanitizeSdp(signal.answer.sdp);

            const localType = pc.localDescription?.type;
            if (pc.signalingState !== 'have-local-offer' || localType !== 'offer') {
              return;
            }

            report('voice.signal.answer.recv', {
              answer: { type: signal.answer.type, ...summarizeSdp(signal.answer.sdp) },
              pc: summarizePc(pc),
            });

            await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
            ringtone.stop();
            set({ callState: 'connected' });
            report('voice.signal.answer.applied', { pc: summarizePc(pc) });

            const { pendingCandidates } = get();
            for (const c of pendingCandidates) {
              await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
            }
            set({ pendingCandidates: [] });
            return;
          }

          if (signal.candidate) {
            if (pc.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {});
            } else {
              set((state) => ({ pendingCandidates: [...state.pendingCandidates, signal.candidate] }));
            }
            return;
          }

          if (signal.candidates) {
            for (const cand of signal.candidates) {
              if (pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
              } else {
                set((state) => ({ pendingCandidates: [...state.pendingCandidates, cand] }));
              }
            }
            return;
          }
        } catch (err) {
          report('voice.signal.error', {
            message: (err as any)?.message ? String((err as any).message) : String(err),
            pc: summarizePc(pc),
          });
        }
      });

      pc.oniceconnectionstatechange = () => {
        report('voice.pc.iceConnectionState', { state: pc.iceConnectionState, pc: summarizePc(pc) });
        if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
          report('voice.pc.iceFailedEnding', { pc: summarizePc(pc) });
          get().endCall();
        }
      };

      pc.onsignalingstatechange = () => {
        report('voice.pc.signalingState', { state: pc.signalingState, pc: summarizePc(pc) });
      };

      pc.onicegatheringstatechange = () => {
        report('voice.pc.iceGatheringState', { state: pc.iceGatheringState, pc: summarizePc(pc) });
      };

      (pc as any).onconnectionstatechange = () => {
        report('voice.pc.connectionState', { state: (pc as any).connectionState ?? null, pc: summarizePc(pc) });
      };

      pc.onnegotiationneeded = () => {
        report('voice.pc.negotiationneeded', { pc: summarizePc(pc) });
      };

      // Handle ICE candidates
      let candidateTimeout: any = null;
      let candidateBatch: any[] = [];
      
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          candidateBatch.push(event.candidate);
          if (candidateTimeout) clearTimeout(candidateTimeout);
          candidateTimeout = setTimeout(() => {
            const batch = [...candidateBatch];
            candidateBatch = [];
            if (batch.length > 0) {
              void voiceAPI.sendSignal(sessionId, { candidates: batch }).catch(() => {});
              report('voice.signal.candidates.sent', {
                count: batch.length,
                sample: batch[0]
                  ? { candidate: batch[0].candidate, sdpMid: batch[0].sdpMid ?? null, sdpMLineIndex: batch[0].sdpMLineIndex ?? null }
                  : null,
                pc: summarizePc(pc),
              });
            }
          }, 300);
        }
      };

      channel.listen('.call.ended', () => {
        report('voice.signal.callEnded.recv', { pc: summarizePc(pc) });
        get().resetCall();
      });

      // 5. If receiver, send ready signal after a short delay
      // This ensures the receiver's Echo subscription is fully active before the initiator sends the offer
      if (!isInitiator) {
        setTimeout(() => {
          void voiceAPI.sendSignal(sessionId, { ready: true }).catch(() => {});
          report('voice.signal.ready.sent', { pc: summarizePc(pc) });
        }, 500);
      }

      const captureMicAndAttach = async () => {
        let localStream: MediaStream;
        try {
          const preferredMic = localStorage.getItem('tt-mic-device') || '';
          const constraints: MediaStreamConstraints = preferredMic
            ? { audio: { deviceId: { exact: preferredMic } }, video: false }
            : { audio: true, video: false };
          localStream = await navigator.mediaDevices.getUserMedia(constraints);
          const t = localStream.getAudioTracks()[0] || null;
          report('voice.mic.ok', {
            preferredMic,
            track: t ? { id: t.id, enabled: t.enabled, muted: (t as any).muted ?? null, readyState: t.readyState } : null,
          });
        } catch (micErr) {
          const err: any = micErr;
          const errName = err?.name ? String(err.name) : '';
          const secureHint = window.isSecureContext ? '' : ' (HTTPS/localhost required)';
          const msg =
            errName === 'NotFoundError'
              ? 'No microphone device found.'
              : errName === 'NotAllowedError' || errName === 'SecurityError'
                ? `Microphone access blocked${secureHint}. Joining as listener.`
                : `Could not access microphone${secureHint}. Joining as listener.`;
          toast.warning(msg);
          report('voice.mic.error', {
            name: errName,
            message: err?.message ? String(err.message) : String(err),
            isSecureContext: window.isSecureContext,
          });
          localStream = new MediaStream();
        }

        if (pc.signalingState === 'closed') return;

        set({ localStream });
        const audioTrack = localStream.getAudioTracks()[0] || null;
        if (audioTransceiver?.sender) {
          try { audioTransceiver.direction = 'sendrecv'; } catch { /* ignore */ }
          await audioTransceiver.sender.replaceTrack(audioTrack).catch(() => {});
          report('voice.mic.attached.replaceTrack', { hasTrack: !!audioTrack, pc: summarizePc(pc) });
        } else if (audioTrack) {
          pc.addTrack(audioTrack, localStream);
          report('voice.mic.attached.addTrack', { pc: summarizePc(pc) });
        }
      };

      void captureMicAndAttach();
    } catch (e) {
      voiceDebugReport('voice.webrtc.error', {
        message: (e as any)?.message ? String((e as any).message) : String(e),
      });
      get().resetCall();
    }
  },

  resetCall: () => {
    ringtone.stop();
    const { localStream, pc, echoChannel, sessionId } = get();

    // Stop all local tracks
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }

    // Close peer connection
    if (pc) {
      pc.close();
    }

    // Leave Echo channel
    if (echoChannel && sessionId) {
      try {
        const echo = getEcho();
        echo.leave(`voice.${sessionId}`);
      } catch {
        // ignore
      }
    }

    set({
      callState: 'idle',
      sessionId: null,
      callerId: null,
      callerName: null,
      recipientId: null,
      recipientName: null,
      localStream: null,
      remoteStream: null,
      isMuted: false,
      isSpeakerOn: true,
      isInitiator: false,
      remoteAccepted: false,
      offerSent: false,
      debugRunId: null,
      pc: null,
      echoChannel: null,
      pendingCandidates: [],
    });
  }
}));
