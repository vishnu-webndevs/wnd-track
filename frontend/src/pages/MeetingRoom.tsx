import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  Video, Mic, MicOff, VideoOff, PhoneOff, Send, Users, 
  MessageSquare, Loader2, ArrowLeft, ShieldAlert, Monitor, Maximize, Settings
} from 'lucide-react';
import { toast } from 'sonner';
import { meetingsAPI } from '../api/meetings';
import { voiceAPI } from '../api/voice';
import { useAuthStore } from '../stores/authStore';
import { getEcho } from '../lib/echo';
import type { Meeting, MeetingMessage, MeetingParticipant } from '../types/meetings';

export default function MeetingRoom() {
  const { id } = useParams<{ id: string }>();
  const meetingId = Number(id);
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeMembers, setActiveMembers] = useState<Array<{ id: number; name: string; role: string }>>([]);
  const [meetingStartMs, setMeetingStartMs] = useState<number | null>(null);
  const [meetingEndMs, setMeetingEndMs] = useState<number | null>(null);
  const [meetingElapsedSec, setMeetingElapsedSec] = useState(0);
  
  // Media States
  const [micActive, setMicActive] = useState(true);
  const [cameraActive, setCameraActive] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>(() => localStorage.getItem('tt-mic-device') || '');
  const [selectedCamId, setSelectedCamId] = useState<string>(() => localStorage.getItem('tt-cam-device') || '');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>(() => localStorage.getItem('tt-speaker-device') || '');
  const [peerVideoEnabled, setPeerVideoEnabled] = useState<Record<number, boolean>>({});
  const [peerVideoActive, setPeerVideoActive] = useState<Record<number, boolean>>({});

  // WebRTC Mesh States
  const [remoteStreams, setRemoteStreams] = useState<Record<number, MediaStream>>({});
  const pcsRef = useRef<Record<number, RTCPeerConnection>>({});
  const videoTransceiversRef = useRef<Record<number, RTCRtpTransceiver>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const presenceChannelRef = useRef<any>(null);
  const renegotiateTimerRef = useRef<number | null>(null);
  const renegotiateAttemptRef = useRef<Record<number, number>>({});

  // Chat States
  const [messages, setMessages] = useState<MeetingMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Fetch initial meeting details and messages
  const loadMeetingAndChat = async () => {
    try {
      const detailRes = await meetingsAPI.getMeetingDetails(meetingId);
      if (detailRes.success) {
        const m = detailRes.data as Meeting;
        setMeeting(m);

        const startedAtMs = m.started_at ? Date.parse(m.started_at) : null;
        const endedAtMs = m.ended_at ? Date.parse(m.ended_at) : null;
        if (startedAtMs && Number.isFinite(startedAtMs)) {
          setMeetingStartMs(startedAtMs);
        } else {
          setMeetingStartMs(Date.now());
        }
        if (endedAtMs && Number.isFinite(endedAtMs)) {
          setMeetingEndMs(endedAtMs);
        } else {
          setMeetingEndMs(null);
        }
        
        // Auto-join meeting room on backend
        await meetingsAPI.joinMeeting(meetingId);
      }

      const messagesRes = await meetingsAPI.getMeetingMessages(meetingId);
      if (messagesRes.success) {
        setMessages(messagesRes.data);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Access denied or meeting not found');
      navigate('/meetings');
    } finally {
      setLoading(false);
    }
  };

  const formatElapsed = (sec: number) => {
    const total = Math.max(0, Math.floor(sec));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!meetingStartMs) return;
    if (meetingEndMs) {
      setMeetingElapsedSec((meetingEndMs - meetingStartMs) / 1000);
      return;
    }

    setMeetingElapsedSec((Date.now() - meetingStartMs) / 1000);
    const t = window.setInterval(() => {
      setMeetingElapsedSec((Date.now() - meetingStartMs) / 1000);
    }, 1000);
    return () => window.clearInterval(t);
  }, [meetingStartMs, meetingEndMs]);

  // Scroll chat to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    broadcastMediaState();
  }, [cameraActive, screenSharing]);

  const refreshMediaDevices = useCallback(async () => {
    if (!('mediaDevices' in navigator) || !navigator.mediaDevices?.enumerateDevices) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioInputs(devices.filter(d => d.kind === 'audioinput'));
      setVideoInputs(devices.filter(d => d.kind === 'videoinput'));
      setAudioOutputs(devices.filter(d => d.kind === 'audiooutput'));
    } catch (e) {
      // ignore
    }
  }, []);

  const requestDevicePermissions = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      stream.getTracks().forEach(t => t.stop());
      await refreshMediaDevices();
    } catch (e) {
      toast.error('Permission denied.');
    }
  };

  useEffect(() => {
    refreshMediaDevices();
    const handler = () => refreshMediaDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', handler);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', handler);
  }, [refreshMediaDevices]);

  const applySpeakerToElement = async (el: HTMLMediaElement) => {
    const deviceId = selectedSpeakerId || '';
    const anyEl = el as any;
    if (!deviceId) return;
    if (typeof anyEl.setSinkId !== 'function') return;
    try {
      await anyEl.setSinkId(deviceId);
    } catch (e) {
      toast.error('Could not switch speaker output for this browser.');
    }
  };

  const switchMicrophone = async (deviceId: string) => {
    localStorage.setItem('tt-mic-device', deviceId);
    setSelectedMicId(deviceId);

    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const constraints: MediaStreamConstraints = deviceId
        ? { audio: { deviceId: { exact: deviceId } }, video: false }
        : { audio: true, video: false };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const newTrack = stream.getAudioTracks()[0];
      if (!newTrack) return;
      newTrack.enabled = micActive;

      const current = localStreamRef.current || new MediaStream();
      const oldTracks = current.getAudioTracks();
      oldTracks.forEach(t => {
        current.removeTrack(t);
        t.stop();
      });
      current.addTrack(newTrack);
      localStreamRef.current = current;
      setLocalStream(current);

      Object.values(pcsRef.current).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
        if (sender) {
          sender.replaceTrack(newTrack).catch(console.error);
        } else {
          pc.addTrack(newTrack, current);
        }
      });

      scheduleRenegotiation();
      refreshMediaDevices();
    } catch (err: any) {
      const errName = err?.name ? String(err.name) : '';
      const secureHint = window.isSecureContext ? '' : ' (HTTPS/localhost required)';
      const msg =
        errName === 'NotAllowedError' || errName === 'SecurityError'
          ? `Microphone access blocked${secureHint}.`
          : `Could not switch microphone${secureHint}.`;
      toast.error(msg);
    }
  };

  const switchCameraDevice = async (deviceId: string) => {
    localStorage.setItem('tt-cam-device', deviceId);
    setSelectedCamId(deviceId);
    if (cameraActive) {
      setCameraActive(false);
      setTimeout(() => setCameraActive(true), 0);
    }
    refreshMediaDevices();
  };

  const switchSpeaker = async (deviceId: string) => {
    localStorage.setItem('tt-speaker-device', deviceId);
    setSelectedSpeakerId(deviceId);
    document.querySelectorAll('audio, video').forEach((el) => {
      void applySpeakerToElement(el as HTMLMediaElement);
    });
    refreshMediaDevices();
  };

  const toggleFullscreen = (e: React.MouseEvent) => {
    const videoElem = (e.currentTarget as HTMLElement).closest('.aspect-video')?.querySelector('video');
    if (videoElem) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(console.error);
      } else {
        videoElem.requestFullscreen().catch(console.error);
      }
    }
  };

  // WebRTC mesh connection helpers
  const initiatePeerConnection = async (peerId: number, isInitiator: boolean, channel: any, meteredServers: RTCIceServer[] = []) => {
    if (pcsRef.current[peerId]) {
      return pcsRef.current[peerId];
    }

    const iceServers = [...meteredServers];

    const pc = new RTCPeerConnection({ iceServers });

    pcsRef.current[peerId] = pc;

    // Add local audio tracks via addTrack (reliable, creates proper SDP m-lines with stream association)
    const currentStream = localStreamRef.current;
    let hasAudio = false;
    if (currentStream && currentStream.getAudioTracks().length > 0) {
      currentStream.getAudioTracks().forEach(track => {
        pc.addTrack(track, currentStream);
        hasAudio = true;
      });
    }

    // CRITICAL: If this user has no mic, we MUST still add an audio transceiver.
    // Otherwise, the SDP will have NO audio channel, and they won't be able to hear others!
    if (!hasAudio) {
      pc.addTransceiver('audio', { direction: 'sendrecv' });
    }

    // Add a video transceiver placeholder for future camera/screen share
    videoTransceiversRef.current[peerId] = pc.addTransceiver('video', { direction: 'sendrecv' });

    let candidateTimeout: any = null;
    let candidateBatch: any[] = [];

    pc.onicecandidate = (event) => {
      if (event.candidate && channel) {
        candidateBatch.push(event.candidate);
        if (candidateTimeout) clearTimeout(candidateTimeout);
        candidateTimeout = setTimeout(() => {
          const batch = [...candidateBatch];
          candidateBatch = [];
          if (batch.length > 0) {
            channel.whisper('meeting-signal', {
              to: peerId,
              from: user?.id,
              candidates: batch
            });
          }
        }, 100);
      }
    };

    pc.ontrack = (event) => {
      console.log(`[WebRTC] ontrack from peer ${peerId}, kind=${event.track.kind}`);

      // Build or update the remote stream for this peer
      setRemoteStreams(prev => {
        // ALWAYS use our own local MediaStream so we can safely add tracks to it (remote streams are immutable in some browsers)
        const existingStream = prev[peerId] || new MediaStream();
        
        if (!existingStream.getTracks().find(t => t.id === event.track.id)) {
          existingStream.addTrack(event.track);
        }

        // Do NOT clone the stream, let the browser handle dynamic track additions to the existing instance
        return {
          ...prev,
          [peerId]: existingStream
        };
      });

      event.track.onended = () => {
        console.log(`[WebRTC] track ended from peer ${peerId}, kind=${event.track.kind}`);
        if (event.track.kind === 'video') {
          setPeerVideoActive(prev => ({ ...prev, [peerId]: false }));
        }
        setRemoteStreams(prev => ({ ...prev }));
      };

      event.track.onmute = () => {
        console.log(`[WebRTC] track muted from peer ${peerId}, kind=${event.track.kind}`);
        if (event.track.kind === 'video') {
          setPeerVideoActive(prev => ({ ...prev, [peerId]: false }));
        }
        setRemoteStreams(prev => ({ ...prev }));
      };

      event.track.onunmute = () => {
        console.log(`[WebRTC] track unmuted from peer ${peerId}, kind=${event.track.kind}`);
        if (event.track.kind === 'video') {
          setPeerVideoActive(prev => ({ ...prev, [peerId]: true }));
        }
        setRemoteStreams(prev => ({ ...prev }));
      };

      if (event.track.kind === 'video') {
        setPeerVideoActive(prev => ({ ...prev, [peerId]: true }));
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE state with peer ${peerId}: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        console.warn(`[WebRTC] ICE failed for peer ${peerId}, attempting restart...`);
        pc.restartIce();
      }
    };

    pc.onnegotiationneeded = async () => {
      // Suppressed: we manually manage offers in the isInitiator block.
    };

    if (isInitiator && user?.id) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log(`[WebRTC] Sent offer to peer ${peerId}`);
        channel.whisper('meeting-signal', {
          to: peerId,
          from: user.id,
          offer: offer
        });
      } catch (e) {
        console.error('Error creating initial offer:', e);
      }
    }

    return pc;
  };

  const broadcastMediaState = (overrides?: { videoEnabled?: boolean }) => {
    const channel = presenceChannelRef.current;
    if (!channel) return;
    const myId = Number(user?.id ?? 0);
    if (!myId) return;

    const videoEnabled = overrides?.videoEnabled ?? (cameraActive || screenSharing);

    Object.keys(pcsRef.current).forEach((peerIdStr) => {
      const peerId = Number(peerIdStr);
      if (!Number.isFinite(peerId) || !peerId) return;
      channel.whisper('meeting-signal', {
        to: peerId,
        from: myId,
        media: { videoEnabled }
      });
    });
  };

  const renegotiate = async (peerId: number, forceInitiate: boolean = false) => {
    const pc = pcsRef.current[peerId];
    if (!pc || pc.signalingState === 'closed') return;
    if (pc.signalingState !== 'stable') return;
    
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      presenceChannelRef.current?.whisper('meeting-signal', {
        to: peerId,
        from: user?.id,
        offer: offer
      });
    } catch (e) {
      console.error('Renegotiation failed:', e);
    }
  };

  const attemptRenegotiate = (peerId: number) => {
    const pc = pcsRef.current[peerId];
    if (!pc || pc.signalingState === 'closed') return;

    if (pc.signalingState === 'stable') {
      renegotiateAttemptRef.current[peerId] = 0;
      void renegotiate(peerId);
      return;
    }

    const tries = (renegotiateAttemptRef.current[peerId] || 0) + 1;
    renegotiateAttemptRef.current[peerId] = tries;
    if (tries > 12) {
      renegotiateAttemptRef.current[peerId] = 0;
      return;
    }

    window.setTimeout(() => attemptRenegotiate(peerId), 250);
  };

  const scheduleRenegotiation = () => {
    if (renegotiateTimerRef.current) {
      window.clearTimeout(renegotiateTimerRef.current);
    }
    renegotiateTimerRef.current = window.setTimeout(() => {
      const myId = Number(user?.id ?? 0);
      Object.keys(pcsRef.current).forEach((peerIdStr) => {
        const peerId = Number(peerIdStr);
        if (!Number.isFinite(peerId) || !peerId) return;

        if (myId && myId < peerId) {
          attemptRenegotiate(peerId);
        } else {
          presenceChannelRef.current?.whisper('meeting-signal', {
            to: peerId,
            from: user?.id,
            renegotiate: true
          });
        }
      });
    }, 150);
  };

  const cleanupWebRTC = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }

    Object.keys(pcsRef.current).forEach(peerId => {
      const pc = pcsRef.current[Number(peerId)];
      if (pc) {
        pc.close();
      }
    });
    pcsRef.current = {};
    videoTransceiversRef.current = {};
    setRemoteStreams({});
  };

  // Recover blocked audio
  useEffect(() => {
    const handleUserGesture = () => {
      document.querySelectorAll('video, audio').forEach((el) => {
        const mediaEl = el as HTMLMediaElement;
        if (mediaEl.paused) {
          mediaEl.play().then(() => setAudioBlocked(false)).catch(() => {});
        }
      });
    };
    window.addEventListener('click', handleUserGesture);
    return () => window.removeEventListener('click', handleUserGesture);
  }, []);

  // Sync local video tag safely
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [cameraActive, screenSharing, localStream]);

  // Request local media and initialize network in sequence
  useEffect(() => {
    let isMounted = true;
    let echoInstance: any = null;
    let pChannel: any = null;
    let privateChan: any = null;
    let activeCameraStream: MediaStream | null = null;
    
    const initRoom = async () => {
      // 1. Get microphone stream
      try {
        const constraints: MediaStreamConstraints = selectedMicId
          ? { audio: { deviceId: { exact: selectedMicId } }, video: false }
          : { audio: true, video: false };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (isMounted) {
          localStreamRef.current = stream;
          setLocalStream(stream);
        } else {
          stream.getTracks().forEach(t => t.stop());
        }
      } catch (err: any) {
        console.warn('Mic access failed:', err?.name, err?.message);
        if (isMounted) {
          const errName = err?.name ? String(err.name) : '';
          const secureHint = window.isSecureContext ? '' : ' (HTTPS/localhost required)';
          const msg =
            errName === 'NotFoundError'
              ? 'No microphone device found.'
              : errName === 'NotAllowedError' || errName === 'SecurityError'
                ? `Microphone access blocked${secureHint}. You can still listen.`
                : `Could not access microphone${secureHint}. You can still listen.`;
          toast.warning(msg);
          const emptyStream = new MediaStream();
          localStreamRef.current = emptyStream;
          setLocalStream(emptyStream);
        }
      }

      if (!isMounted) return;

      // 2. Load API data
      await loadMeetingAndChat();

      if (!isMounted) return;

      // Fetch Metered.ca TURN servers ONCE securely from backend
      let meteredServers: RTCIceServer[] = [];
      try {
        const res = await voiceAPI.getIceServers();
        if (res.success && Array.isArray(res.iceServers)) {
          meteredServers = res.iceServers as unknown as RTCIceServer[];
        }
      } catch (err) {
        console.error('Failed to fetch ICE servers from backend:', err);
      }

      if (!isMounted) return;
      const echo = getEcho();
      echoInstance = echo;
      const presenceChannelName = `presence-meeting.${meetingId}`;
      const userPrivateChannelName = `App.Models.User.${user?.id}`;

      // Join meeting presence channel
      const presenceChannel = echo.join(presenceChannelName);
      presenceChannelRef.current = presenceChannel;
      pChannel = presenceChannel;

      presenceChannel
        .here((usersList: Array<{ id: number; name: string; role: string }>) => {
          setActiveMembers(usersList);
          // Establish connections to existing members
          usersList.forEach(async (member) => {
            if (Number(member.id) !== Number(user?.id)) {
              const isInitiator = Number(user?.id ?? 0) < Number(member.id);
              await initiatePeerConnection(member.id, isInitiator, presenceChannel, meteredServers);
            }
          });
          broadcastMediaState();
        })
        .joining(async (joiningUser: { id: number; name: string; role: string }) => {
          setActiveMembers(prev => {
            if (prev.some(u => u.id === joiningUser.id)) return prev;
            return [...prev, joiningUser];
          });
          toast.info(`${joiningUser.name} joined the meeting room`);

          // Establish connection to joining member
          if (Number(joiningUser.id) !== Number(user?.id)) {
            const isInitiator = Number(user?.id ?? 0) < Number(joiningUser.id);
            await initiatePeerConnection(joiningUser.id, isInitiator, presenceChannel, meteredServers);
          }
          broadcastMediaState();
        })
        .leaving((leavingUser: { id: number; name: string; role: string }) => {
          setActiveMembers(prev => prev.filter(u => u.id !== leavingUser.id));

          // Clean up connection to leaving user
          const pc = pcsRef.current[leavingUser.id];
          if (pc) {
            pc.close();
            delete pcsRef.current[leavingUser.id];
          }
          if (videoTransceiversRef.current[leavingUser.id]) {
            delete videoTransceiversRef.current[leavingUser.id];
          }
          setRemoteStreams(prev => {
            const copy = { ...prev };
            delete copy[leavingUser.id];
            return copy;
          });

          toast.info(`${leavingUser.name} left the meeting room`);
        })
        .listen('.new.meeting.message', (e: { message: MeetingMessage }) => {
          setMessages(prev => {
            // Deduplicate: skip if this message was already added (e.g. from API response)
            if (prev.some(m => m.id === e.message.id)) return prev;
            return [...prev, e.message];
          });
        })
        .listen('.meeting.ended', (e: { meeting: Meeting }) => {
          const startedAtMs = e.meeting.started_at ? Date.parse(e.meeting.started_at) : meetingStartMs;
          const endedAtMs = e.meeting.ended_at ? Date.parse(e.meeting.ended_at) : Date.now();
          if (startedAtMs && Number.isFinite(startedAtMs) && Number.isFinite(endedAtMs)) {
            setMeetingStartMs(startedAtMs);
            setMeetingEndMs(endedAtMs);
            const sec = (endedAtMs - startedAtMs) / 1000;
            toast.warning(`Meeting ended • Duration ${formatElapsed(sec)}`);
          } else {
            toast.warning('The host has ended this meeting.');
          }
          setTimeout(() => navigate('/meetings'), 2000);
        });

      const pendingCandidates: Record<number, any[]> = {};

      const sanitizeSdp = (sdp: string) => {
        if (!sdp) return sdp;
        const lines = sdp.split(/\r\n|\n/);
        const rebuilt = lines.join('\r\n').trim();
        return rebuilt ? `${rebuilt}\r\n` : rebuilt;
      };

      // Listen to signaling whisper
      presenceChannel.listenForWhisper('meeting-signal', async (data: { to: number; from: number; offer?: any; answer?: any; candidates?: any; candidate?: any; renegotiate?: boolean; media?: { videoEnabled?: boolean } }) => {
        if (Number(data.to) !== Number(user?.id)) return;

        const peerId = data.from;
        let pc = pcsRef.current[peerId];
        
        if (!pc) {
          pc = await initiatePeerConnection(peerId, false, presenceChannel, meteredServers);
        }

        try {
          if (data.media && typeof data.media.videoEnabled === 'boolean') {
            setPeerVideoEnabled(prev => ({ ...prev, [peerId]: data.media!.videoEnabled! }));
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
                } catch (e) {
                  // ignore rollback failures
                }
              }
            }
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            
            // Process queued candidates
            const queued = pendingCandidates[peerId] || [];
            for (const c of queued) {
              await pc.addIceCandidate(new RTCIceCandidate(c)).catch(console.error);
            }
            pendingCandidates[peerId] = [];

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            presenceChannel.whisper('meeting-signal', {
              to: peerId,
              from: user?.id,
              answer: answer
            });
          } else if (data.answer) {
            if (data.answer.sdp) data.answer.sdp = sanitizeSdp(data.answer.sdp);

            if (pc.signalingState === 'stable') {
              return;
            }

            if (pc.remoteDescription?.type === 'answer') {
              return;
            }

            const localType = pc.localDescription?.type;
            if (pc.signalingState !== 'have-local-offer' || localType !== 'offer') {
              console.warn('Skipping incoming answer: no local offer sent');
              return;
            }

            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            
            // Process queued candidates
            const queued = pendingCandidates[peerId] || [];
            for (const c of queued) {
              await pc.addIceCandidate(new RTCIceCandidate(c)).catch(console.error);
            }
            pendingCandidates[peerId] = [];
          } else if (data.candidates) {
            for (const cand of data.candidates) {
              if (pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(console.error);
              } else {
                if (!pendingCandidates[peerId]) pendingCandidates[peerId] = [];
                pendingCandidates[peerId].push(cand);
              }
            }
          } else if (data.candidate) {
            const cand = data.candidate;
            if (pc.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(console.error);
            } else {
              if (!pendingCandidates[peerId]) pendingCandidates[peerId] = [];
              pendingCandidates[peerId].push(cand);
            }
          }
        } catch (err) {
          console.error('Error handling meeting signaling message:', err);
        }
      });

      // Listen to user private channel for Meeting Ended event
      const privateChannel = echo.private(userPrivateChannelName);
      privateChan = privateChannel;
      privateChannel.listen('.meeting.ended', (e: { meeting: Meeting }) => {
        if (e.meeting.id === meetingId) {
          const startedAtMs = e.meeting.started_at ? Date.parse(e.meeting.started_at) : meetingStartMs;
          const endedAtMs = e.meeting.ended_at ? Date.parse(e.meeting.ended_at) : Date.now();
          if (startedAtMs && Number.isFinite(startedAtMs) && Number.isFinite(endedAtMs)) {
            setMeetingStartMs(startedAtMs);
            setMeetingEndMs(endedAtMs);
            const sec = (endedAtMs - startedAtMs) / 1000;
            toast.warning(`Meeting ended • Duration ${formatElapsed(sec)}`);
          } else {
            toast.warning('The host has ended this meeting.');
          }
          setTimeout(() => navigate('/meetings'), 2000);
        }
      });
    };

    initRoom();

    return () => {
      isMounted = false;
      cleanupWebRTC();
      if (echoInstance) {
        if (pChannel) echoInstance.leave(`presence-meeting.${meetingId}`);
        if (privateChan) privateChan.stopListening('.meeting.ended');
      }
    };
  }, [meetingId, user?.id]);

  // Sync mic toggle
  useEffect(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = micActive;
      });
    }
  }, [micActive, localStream]);

  // Request camera stream when camera is toggled
  useEffect(() => {
    let activeCameraStream: MediaStream | null = null;
    
    if (cameraActive) {
      if (screenSharing) {
        stopScreenShare();
      }

      const constraints: MediaStreamConstraints = selectedCamId
        ? { video: { width: 1280, height: 720, deviceId: { exact: selectedCamId } }, audio: false }
        : { video: { width: 1280, height: 720 }, audio: false };
      navigator.mediaDevices.getUserMedia(constraints)
        .then(stream => {
          activeCameraStream = stream;
          const videoTrack = stream.getVideoTracks()[0];
          
          if (localStreamRef.current) {
            localStreamRef.current.getVideoTracks().forEach(t => {
              localStreamRef.current?.removeTrack(t);
              t.stop();
            });
            localStreamRef.current.addTrack(videoTrack);
          }

          // Add/Replace track on all active connections
          Object.entries(pcsRef.current).forEach(([peerId, pc]) => {
            const pid = Number(peerId);
            const transceiver = videoTransceiversRef.current[pid] || pc.getTransceivers().find(tr => tr.receiver.track.kind === 'video');
            if (transceiver?.sender) {
              try {
                transceiver.direction = 'sendrecv';
              } catch (e) {
                // ignore
              }
              transceiver.sender.replaceTrack(videoTrack).catch(console.error);
              if (pid && !videoTransceiversRef.current[pid]) {
                videoTransceiversRef.current[pid] = transceiver;
              }
            }
          });
          scheduleRenegotiation();
        })
        .catch(err => {
          console.error('Camera access denied:', err);
          const errName = err?.name ? String(err.name) : '';
          const secureHint = window.isSecureContext ? '' : ' (HTTPS/localhost required)';
          const msg =
            errName === 'NotFoundError'
              ? 'No camera device found.'
              : errName === 'NotAllowedError' || errName === 'SecurityError'
                ? `Camera access blocked${secureHint}.`
                : `Could not access camera${secureHint}.`;
          toast.error(msg);
          setCameraActive(false);
        });
    } else {
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach(track => {
          localStreamRef.current?.removeTrack(track);
          track.stop();
        });
      }
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      
      Object.entries(pcsRef.current).forEach(([peerId, pc]) => {
        const pid = Number(peerId);
        const transceiver = videoTransceiversRef.current[pid] || pc.getTransceivers().find(tr => tr.receiver.track.kind === 'video');
        if (transceiver?.sender) {
          try {
            transceiver.direction = 'recvonly';
          } catch (e) {
            // ignore
          }
          transceiver.sender.replaceTrack(null).catch(console.error);
          if (pid && !videoTransceiversRef.current[pid]) {
            videoTransceiversRef.current[pid] = transceiver;
          }
        }
      });
      scheduleRenegotiation();
    }

    return () => {
      if (activeCameraStream) {
        activeCameraStream.getTracks().forEach(t => t.stop());
      }
    };
  }, [cameraActive, selectedCamId, screenSharing]);

  const toggleScreenShare = async () => {
    if (screenSharing) {
      stopScreenShare();
    } else {
      try {
        if (cameraActive) {
          setCameraActive(false);
        }

        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        screenStreamRef.current = stream;
        setScreenSharing(true);

        const videoTrack = stream.getVideoTracks()[0];
        videoTrack.onended = () => {
          stopScreenShare();
        };

        if (localStreamRef.current) {
          localStreamRef.current.getVideoTracks().forEach(t => {
            localStreamRef.current?.removeTrack(t);
            t.stop();
          });
          localStreamRef.current.addTrack(videoTrack);
        }

        Object.entries(pcsRef.current).forEach(([peerId, pc]) => {
          const pid = Number(peerId);
          const transceiver = videoTransceiversRef.current[pid] || pc.getTransceivers().find(tr => tr.receiver.track.kind === 'video');
          if (transceiver?.sender) {
            try {
              transceiver.direction = 'sendrecv';
            } catch (e) {
              // ignore
            }
            transceiver.sender.replaceTrack(videoTrack).catch(console.error);
            if (pid && !videoTransceiversRef.current[pid]) {
              videoTransceiversRef.current[pid] = transceiver;
            }
          }
        });
        scheduleRenegotiation();
      } catch (err) {
        console.error('Screen share denied:', err);
        const e: any = err;
        const errName = e?.name ? String(e.name) : '';
        const secureHint = window.isSecureContext ? '' : ' (HTTPS/localhost required)';
        const msg =
          errName === 'NotAllowedError' || errName === 'SecurityError'
            ? `Screen share blocked${secureHint}.`
            : `Could not share screen${secureHint}.`;
        toast.error(msg);
        setScreenSharing(false);
      }
    }
  };

  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    setScreenSharing(false);

    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        localStreamRef.current?.removeTrack(track);
        track.stop();
      });
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    Object.entries(pcsRef.current).forEach(([peerId, pc]) => {
      const pid = Number(peerId);
      const transceiver = videoTransceiversRef.current[pid] || pc.getTransceivers().find(tr => tr.receiver.track.kind === 'video');
      if (transceiver?.sender) {
        try {
          transceiver.direction = 'recvonly';
        } catch (e) {
          // ignore
        }
        transceiver.sender.replaceTrack(null).catch(console.error);
        if (pid && !videoTransceiversRef.current[pid]) {
          videoTransceiversRef.current[pid] = transceiver;
        }
      }
    });
    scheduleRenegotiation();
  };



  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sendingMessage) return;

    setSendingMessage(true);
    try {
      const res = await meetingsAPI.sendMeetingMessage(meetingId, newMessage);
      if (res.success) {
        setMessages(prev => {
          if (prev.some(m => m.id === res.data.id)) return prev;
          return [...prev, res.data];
        });
        setNewMessage('');
      }
    } catch (err) {
      toast.error('Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleLeave = async () => {
    try {
      await meetingsAPI.leaveMeeting(meetingId);
      cleanupWebRTC();
      navigate('/meetings');
    } catch (err) {
      cleanupWebRTC();
      navigate('/meetings');
    }
  };

  const handleEndMeeting = async () => {
    if (!window.confirm('Are you sure you want to end this meeting for all participants?')) return;
    try {
      const res = await meetingsAPI.endMeeting(meetingId);
      if (res.success) {
        const startedAtMs = res.data?.started_at ? Date.parse(res.data.started_at) : meetingStartMs;
        const endedAtMs = res.data?.ended_at ? Date.parse(res.data.ended_at) : Date.now();
        if (startedAtMs && Number.isFinite(startedAtMs) && Number.isFinite(endedAtMs)) {
          setMeetingStartMs(startedAtMs);
          setMeetingEndMs(endedAtMs);
          const sec = (endedAtMs - startedAtMs) / 1000;
          toast.success(`Meeting ended • Duration ${formatElapsed(sec)}`);
        } else {
          toast.success('Meeting ended for all');
        }
        navigate('/meetings');
      }
    } catch (err) {
      toast.error('Failed to end meeting');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px]">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
        <span className="text-gray-500 font-medium">Entering meeting room...</span>
      </div>
    );
  }

  if (!meeting) return null;

  const isHost = meeting.created_by === user?.id;

  return (
    <div className="h-[calc(100dvh-5rem)] md:h-[calc(100vh-8rem)] flex flex-col md:flex-row overflow-hidden bg-gray-950 md:rounded-2xl md:border border-gray-800 md:shadow-2xl relative -mx-4 sm:mx-0">
      {/* Audio Blocked Overlay */}
      {audioBlocked && (
        <div 
          className="absolute inset-0 z-[100] flex items-center justify-center bg-gray-950/90 backdrop-blur-md"
          onClick={() => {
            document.querySelectorAll('video, audio').forEach((el) => {
              const mediaEl = el as HTMLMediaElement;
              if (mediaEl.paused) {
                mediaEl.play().catch(console.error);
              }
            });
            setAudioBlocked(false);
          }}
        >
          <div className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-full font-bold text-lg shadow-2xl flex items-center gap-3 animate-pulse cursor-pointer transform hover:scale-105 transition">
            <Monitor className="w-6 h-6" />
            Click here to join meeting audio
          </div>
        </div>
      )}

      {showDeviceSettings && (
        <div className="absolute inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/60">
              <div className="flex items-center gap-2 text-white font-extrabold">
                <Settings className="w-4 h-4 text-indigo-400" />
                Audio/Video Devices
              </div>
              <button
                onClick={() => setShowDeviceSettings(false)}
                className="text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-800 transition"
              >
                Close
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="flex gap-2">
                <button
                  onClick={() => requestDevicePermissions()}
                  className="flex-1 px-3 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-white text-xs font-bold border border-gray-700 transition"
                >
                  Grant Permissions
                </button>
                <button
                  onClick={() => refreshMediaDevices()}
                  className="flex-1 px-3 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-white text-xs font-bold border border-gray-700 transition"
                >
                  Refresh Devices
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">Microphone</label>
                <select
                  value={selectedMicId}
                  onChange={(e) => switchMicrophone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-gray-900 text-white border border-gray-800 text-xs"
                >
                  <option value="">Default</option>
                  {audioInputs.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Microphone (${d.deviceId.slice(0, 6)}...)`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">Camera</label>
                <select
                  value={selectedCamId}
                  onChange={(e) => switchCameraDevice(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-gray-900 text-white border border-gray-800 text-xs"
                >
                  <option value="">Default</option>
                  {videoInputs.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Camera (${d.deviceId.slice(0, 6)}...)`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">Speaker</label>
                <select
                  value={selectedSpeakerId}
                  onChange={(e) => switchSpeaker(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-gray-900 text-white border border-gray-800 text-xs"
                  disabled={typeof (HTMLMediaElement.prototype as any).setSinkId !== 'function'}
                >
                  <option value="">Default</option>
                  {audioOutputs.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Speaker (${d.deviceId.slice(0, 6)}...)`}
                    </option>
                  ))}
                </select>
                {typeof (HTMLMediaElement.prototype as any).setSinkId !== 'function' && (
                  <div className="text-[10px] text-gray-500 mt-1">
                    Speaker selection not supported in this browser.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Video/Grid Area */}
      <div className="flex-1 flex flex-col p-2 sm:p-4 md:p-6 overflow-hidden min-h-0 bg-gray-900/60">
        
        {/* Top bar info */}
        <div className="flex justify-between items-center bg-gray-900/80 backdrop-blur border border-gray-800 p-2 sm:p-4 rounded-xl z-10 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <button 
              onClick={handleLeave}
              className="p-1.5 sm:p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <div className="min-w-0">
              <h2 className="font-extrabold text-white text-sm sm:text-base leading-tight truncate">{meeting.title}</h2>
              <p className="text-[10px] sm:text-xs text-indigo-400 truncate">
                Presence: {activeMembers.length} • <span className="capitalize">{meeting.type}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {meetingStartMs && (
              <span className="hidden sm:flex items-center gap-1 text-[10px] sm:text-xs bg-indigo-600/10 text-indigo-300 border border-indigo-500/25 px-2 sm:px-2.5 py-1 rounded-full font-bold">
                {meetingEndMs ? 'Ended' : 'Live'} • {formatElapsed(meetingElapsedSec)}
              </span>
            )}
            <span className="hidden sm:flex items-center gap-1 text-[10px] sm:text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 sm:px-2.5 py-1 rounded-full font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
              SECURE
            </span>
          </div>
        </div>

        {/* Video / Avatar Grid */}
        <div className="flex-1 my-2 sm:my-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6 overflow-y-auto min-h-0 p-1 sm:p-2 items-center justify-center content-start sm:content-center">
          
          {/* Local participant feed */}
          <div className="aspect-video bg-gray-950 border border-gray-800 rounded-2xl relative overflow-hidden flex flex-col items-center justify-center shadow-lg group hover:border-indigo-500/50 transition duration-300">
            {(cameraActive || screenSharing) ? (
              <video 
                ref={localVideoRef} 
                autoPlay 
                playsInline 
                muted 
                className={`w-full h-full rounded-2xl ${screenSharing ? 'object-contain' : 'object-cover'}`}
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-indigo-650 flex items-center justify-center text-white text-xl font-black">
                {user?.name.charAt(0).toUpperCase()}
              </div>
            )}
            
            <div className="absolute bottom-3 left-3 bg-gray-900/80 backdrop-blur px-2.5 py-1 rounded-lg border border-gray-850 flex items-center gap-2 text-xs font-semibold text-white">
              <span>You (Host/Participant)</span>
              {!micActive && <MicOff className="w-3.5 h-3.5 text-red-500" />}
            </div>
          </div>

          {/* Active meeting participants list */}
          {activeMembers.filter(m => Number(m.id) !== Number(user?.id)).map(member => {
            const remoteStream = remoteStreams[member.id];
            const remoteVideoOn = peerVideoEnabled[member.id] ?? true;
            const remoteVideoActive = peerVideoActive[member.id] ?? false;
            const videoTrack = remoteStream?.getVideoTracks()[0];
            const hasVideo = remoteVideoOn && remoteVideoActive && !!videoTrack && videoTrack.readyState === 'live';
            
            return (
              <div 
                key={member.id}
                className="aspect-video bg-gray-950 border border-gray-800 rounded-2xl relative overflow-hidden flex flex-col items-center justify-center shadow-lg hover:border-indigo-500/30 transition duration-300"
              >
                <audio
                  autoPlay
                  playsInline
                  style={{ position: 'fixed', top: '-9999px', left: '-9999px' }}
                  ref={(el) => {
                    if (!el || !remoteStream) return;
                    if (el.srcObject !== remoteStream) {
                      el.srcObject = remoteStream;
                      el.muted = false;
                      el.volume = 1;
                    }
                    void applySpeakerToElement(el);
                    el.play().catch(err => {
                      console.warn('Autoplay blocked for audio:', err);
                      setAudioBlocked(true);
                    });
                  }}
                />
                <video
                  autoPlay
                  playsInline 
                  onDoubleClick={toggleFullscreen}
                  className="w-full h-full object-contain rounded-2xl cursor-pointer"
                  ref={(el) => {
                    if (!el) return;
                    if (!remoteVideoOn) {
                      if (el.srcObject) {
                        el.srcObject = null;
                      }
                      return;
                    }
                    el.muted = true;
                    el.volume = 0;
                    if (remoteStream && el.srcObject !== remoteStream) {
                      el.srcObject = remoteStream;
                    }
                    el.play().catch(err => {
                      console.warn('Autoplay blocked for video:', err);
                      setAudioBlocked(true);
                    });
                  }}
                />
                {!hasVideo && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-950 z-10">
                    <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center text-white text-xl font-bold border border-gray-700">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                  </div>
                )}


                <div className="absolute bottom-3 left-3 bg-gray-900/80 backdrop-blur px-2.5 py-1 rounded-lg border border-gray-850 flex items-center gap-2 text-xs text-white font-semibold">
                  <span>{member.name}</span>
                  {member.role === 'host' && (
                    <span className="text-[9px] bg-indigo-500/20 text-indigo-400 border border-indigo-500/35 px-1 rounded font-bold">
                      Host
                    </span>
                  )}
                </div>

                {hasVideo && (
                  <button onClick={toggleFullscreen} className="absolute top-3 right-3 bg-gray-900/80 backdrop-blur p-1.5 rounded-lg border border-gray-850 hover:bg-gray-800 transition z-10 text-gray-300 hover:text-white" title="Fullscreen / Zoom">
                    <Maximize className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}

          {/* Invited but offline users list */}
          {meeting.participants
            .filter(p => !activeMembers.some(am => Number(am.id) === Number(p.id)))
            .map(p => (
              <div 
                key={p.id}
                className="aspect-video bg-gray-950/40 border border-gray-900 border-dashed rounded-2xl relative overflow-hidden flex flex-col items-center justify-center opacity-40 hover:opacity-60 transition duration-300"
              >
                <div className="w-12 h-12 rounded-full bg-gray-900 flex items-center justify-center text-gray-500 text-lg font-bold border border-gray-800">
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs text-gray-500 font-medium mt-2">Not in room</span>

                <div className="absolute bottom-3 left-3 bg-gray-955/80 backdrop-blur px-2 py-0.5 rounded border border-gray-900 flex items-center gap-1.5 text-[10px] text-gray-400 font-medium">
                  <span>{p.name}</span>
                  <span className="text-[9px] uppercase tracking-wide opacity-80">({p.pivot.status})</span>
                </div>
              </div>
            ))}
        </div>

        {/* Action Controls Bar */}
        <div className="bg-gray-900/80 backdrop-blur border border-gray-850 p-2 sm:p-4 rounded-xl flex flex-wrap items-center justify-center sm:justify-between gap-3 sm:gap-4 z-10 shrink-0 mt-auto">
          <div className="flex gap-2">
            <button
              onClick={() => setMicActive(prev => !prev)}
              className={`p-2.5 sm:p-3 rounded-xl transition font-semibold border ${
                micActive 
                  ? 'bg-gray-800 hover:bg-gray-700 text-white border-gray-700' 
                  : 'bg-red-500/10 border-red-500/35 text-red-500 hover:bg-red-500/20'
              }`}
              title={micActive ? 'Mute Mic' : 'Unmute Mic'}
            >
              {micActive ? <Mic className="w-4 h-4 sm:w-5 sm:h-5" /> : <MicOff className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>

            <button
              onClick={() => setCameraActive(prev => !prev)}
              className={`p-2.5 sm:p-3 rounded-xl transition font-semibold border ${
                cameraActive 
                  ? 'bg-gray-800 hover:bg-gray-700 text-white border-gray-700' 
                  : 'bg-red-500/10 border-red-500/35 text-red-500 hover:bg-red-500/20'
              }`}
              title={cameraActive ? 'Turn Off Camera' : 'Turn On Camera'}
            >
              {cameraActive ? <Video className="w-4 h-4 sm:w-5 sm:h-5" /> : <VideoOff className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>

            <button
              onClick={toggleScreenShare}
              className={`p-2.5 sm:p-3 rounded-xl transition font-semibold border ${
                screenSharing 
                  ? 'bg-indigo-600/10 border-indigo-500/35 text-indigo-400 hover:bg-indigo-650/20' 
                  : 'bg-gray-800 hover:bg-gray-700 text-white border-gray-700'
              }`}
              title={screenSharing ? 'Stop Screen Share' : 'Share Screen'}
            >
              <Monitor className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <button
              onClick={() => setShowDeviceSettings(true)}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2 rounded-xl text-[10px] sm:text-xs font-bold transition border bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
              title="Audio/Video Devices"
            >
              <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Devices
            </button>
            <button
              onClick={() => setShowChat(prev => !prev)}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2 rounded-xl text-[10px] sm:text-xs font-bold transition border ${
                showChat 
                  ? 'bg-indigo-600/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-650/20' 
                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Chat
            </button>

            {user?.role === 'admin' && (
              <button
                onClick={handleEndMeeting}
                className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-red-655 hover:bg-red-700 text-white text-[10px] sm:text-xs font-black rounded-xl shadow-md transition"
              >
                <ShieldAlert className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">End for All</span>
                <span className="sm:hidden">End</span>
              </button>
            )}

            <button
              onClick={handleLeave}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-gray-800 border border-gray-700 hover:bg-gray-700 text-red-400 text-[10px] sm:text-xs font-extrabold rounded-xl transition"
            >
              <PhoneOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Leave
            </button>
          </div>
        </div>

      </div>

      {/* Right Chat Sidebar */}
      {showChat && (
        <div className="w-full md:w-80 h-1/2 md:h-full border-t md:border-t-0 md:border-l border-gray-800 bg-gray-950 flex flex-col shrink-0">
          <div className="p-3 sm:p-4 border-b border-gray-800 bg-gray-900/40 flex items-center justify-between">
            <h3 className="font-extrabold text-white text-xs sm:text-sm flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-indigo-400" />
              In-Meeting Chat
            </h3>
            <button className="md:hidden text-gray-400 hover:text-white" onClick={() => setShowChat(false)}>
              <span className="sr-only">Close</span>
              &times;
            </button>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 flex flex-col justify-end min-h-0">
            {messages.length === 0 ? (
              <div className="text-center py-8 text-gray-600">
                <p className="text-xs">No messages yet.</p>
                <p className="text-[10px] mt-0.5">Send a message to start conversing.</p>
              </div>
            ) : (
              messages.map(msg => {
                const isMe = msg.user_id === user?.id;
                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] font-bold text-gray-400">{isMe ? 'You' : msg.user_name}</span>
                      <span className="text-[9px] text-gray-600">
                        {new Date(msg.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className={`px-3 py-2 rounded-2xl text-xs max-w-[90%] break-words leading-relaxed ${
                      isMe 
                        ? 'bg-indigo-600 text-white rounded-tr-none' 
                        : 'bg-gray-800 text-gray-200 rounded-tl-none'
                    }`}>
                      {msg.message}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input Form */}
          <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-800 bg-gray-900/20">
            <div className="flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-3 py-2 text-xs rounded-xl border border-gray-800 bg-gray-900 text-white focus:ring-1 focus:ring-indigo-500 focus:border-transparent transition"
              />
              <button
                type="submit"
                disabled={!newMessage.trim() || sendingMessage}
                className="p-2 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl transition disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
