import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Video, Mic, MicOff, VideoOff, PhoneOff, Send, Users,
  MessageSquare, Loader2, ArrowLeft, ShieldAlert, Monitor, Maximize, Settings
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../stores/authStore';
import { useMeetingStore } from '../stores/meetingStore';
import { usersAPI } from '../api/users';
import { meetingsAPI } from '../api/meetings';
import type { User } from '../types';

function useActiveSpeaker(stream: MediaStream | null, enabled: boolean = true) {
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    if (!stream || !enabled) {
      setIsSpeaking(false);
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      setIsSpeaking(false);
      return;
    }

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.2;

      const source = audioContext.createMediaStreamSource(new MediaStream([audioTracks[0]]));
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let animationFrame: number;
      let lastSpeakTime = 0;

      const checkAudioLevel = () => {
        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;

        if (average > 10) {
          lastSpeakTime = Date.now();
          setIsSpeaking(true);
        } else {
          if (Date.now() - lastSpeakTime > 500) {
            setIsSpeaking(false);
          }
        }
        animationFrame = requestAnimationFrame(checkAudioLevel);
      };

      checkAudioLevel();

      return () => {
        cancelAnimationFrame(animationFrame);
        source.disconnect();
        analyser.disconnect();
        if (audioContext.state !== 'closed') {
          audioContext.close().catch(() => { });
        }
      };
    } catch (err) {
      return () => { };
    }
  }, [stream, enabled]);

  return isSpeaking;
}

function RemoteParticipantTile({
  member,
  remoteStream,
  remoteVideoOn,
  peerMicEnabled,
  toggleFullscreen,
  applySpeakerToElement,
  setAudioBlocked
}: {
  member: any;
  remoteStream: MediaStream | undefined;
  remoteVideoOn: boolean;
  peerMicEnabled: boolean;
  toggleFullscreen: (e: any) => void;
  applySpeakerToElement: (el: any) => void;
  setAudioBlocked: (v: boolean) => void;
}) {
  const videoTrack = remoteStream?.getVideoTracks()[0];
  const hasVideo = remoteVideoOn && !!videoTrack && videoTrack.readyState === 'live';
  const isSpeaking = useActiveSpeaker(remoteStream, peerMicEnabled);

  return (
    <div
      className={`aspect-video bg-gray-950 border rounded-2xl relative overflow-hidden flex flex-col items-center justify-center shadow-lg transition duration-300 ${isSpeaking ? 'border-indigo-500 shadow-indigo-500/20' : 'border-gray-800 hover:border-indigo-500/30'}`}
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
            void err;
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
            void err;
            setAudioBlocked(true);
          });
        }}
      />
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950 z-10">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold border transition-colors ${isSpeaking ? 'bg-indigo-600 border-indigo-400' : 'bg-gray-800 border-gray-700'}`}>
            {member.name.charAt(0).toUpperCase()}
          </div>
        </div>
      )}

      <div className="absolute bottom-3 left-3 bg-gray-900/80 backdrop-blur px-2.5 py-1 rounded-lg border border-gray-850 flex items-center gap-2 text-xs text-white font-semibold">
        <span>{member.name}</span>
        {!peerMicEnabled && <MicOff className="w-3.5 h-3.5 text-red-500" />}
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
}

export default function MeetingRoom() {
  const { id } = useParams<{ id: string }>();
  const meetingId = Number(id);
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const {
    meeting,
    localStream,
    remoteStreams,
    activeMembers,
    micActive,
    cameraActive,
    screenSharing,
    messages,
    audioBlocked,
    peerVideoEnabled,
    peerMicEnabled,
    recording,
    recordingDuration,
    meetingElapsedSec,
    showDeviceSettings,
    audioInputs,
    videoInputs,
    audioOutputs,
    selectedMicId,
    selectedCamId,
    selectedSpeakerId,
    initRoom,
    leaveRoom,
    endRoom,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    switchMicrophone,
    switchCameraDevice,
    switchSpeaker,
    refreshDevices,
    requestPermissions,
    setAudioBlocked,
    setShowDeviceSettings,
    sendMessage,
    startRecording,
    stopRecording
  } = useMeetingStore();

  const [loading, setLoading] = useState(true);
  const [inviteUsers, setInviteUsers] = useState<User[]>([]);
  const [selectedInviteIds, setSelectedInviteIds] = useState<number[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviting, setInviting] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  // Chat States
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const isSpeakingLocal = useActiveSpeaker(localStream, micActive);

  // Initialize store and connections
  useEffect(() => {
    if (meetingId) {
      setLoading(true);
      initRoom(meetingId).finally(() => setLoading(false));
    }
  }, [meetingId]);

  // Navigate back to /meetings if meeting in store becomes null (e.g. host ended)
  useEffect(() => {
    if (!loading && !meeting) {
      navigate('/meetings');
    }
  }, [meeting, loading]);

  const formatElapsed = (sec: number) => {
    const total = Math.max(0, Math.floor(sec));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Scroll chat to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Sync local video tag safely
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [cameraActive, screenSharing, localStream]);

  // Recover blocked audio
  useEffect(() => {
    const handleUserGesture = () => {
      document.querySelectorAll('video, audio').forEach((el) => {
        const mediaEl = el as HTMLMediaElement;
        if (mediaEl.paused) {
          mediaEl.play().then(() => setAudioBlocked(false)).catch(() => { });
        }
      });
    };
    window.addEventListener('click', handleUserGesture);
    return () => window.removeEventListener('click', handleUserGesture);
  }, []);

  const toggleFullscreen = (e: React.MouseEvent) => {
    const videoElem = (e.currentTarget as HTMLElement).closest('.aspect-video')?.querySelector('video');
    if (videoElem) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => void 0);
      } else {
        videoElem.requestFullscreen().catch(() => void 0);
      }
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sendingMessage) return;

    setSendingMessage(true);
    await sendMessage(newMessage);
    setNewMessage('');
    setSendingMessage(false);
  };

  const fetchInviteUsers = async () => {
    try {
      const res = await usersAPI.getUsers({ status: 'active', per_page: 1000 });
      const participantsIds = new Set(meeting?.participants.map(p => p.id) ?? []);
      const eligible = res.data.filter((u: User) => u.id !== user?.id && !participantsIds.has(u.id));
      setInviteUsers(eligible);
    } catch (err) {
      // Error fetching users silently
    }
  };

  const handleSendInvites = async () => {
    if (selectedInviteIds.length === 0) return;
    setInviting(true);
    try {
      const res = await meetingsAPI.inviteParticipants(meetingId, selectedInviteIds);
      if (res.success) {
        toast.success('Invitations sent successfully.');
        setShowInviteModal(false);
        setSelectedInviteIds([]);
      }
    } catch (err) {
      toast.error('Failed to send invitations.');
    } finally {
      setInviting(false);
    }
  };

  const applySpeakerToElement = async (el: HTMLMediaElement) => {
    const deviceId = selectedSpeakerId || '';
    const anyEl = el as any;
    if (!deviceId) return;
    if (typeof anyEl.setSinkId !== 'function') return;
    try {
      await anyEl.setSinkId(deviceId);
    } catch (e) {
      // Speaker switch not supported
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
                mediaEl.play().catch(() => void 0);
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
                  onClick={() => requestPermissions()}
                  className="flex-1 px-3 py-2 rounded-xl bg-gray-880 hover:bg-gray-700 text-white text-xs font-bold border border-gray-700 transition"
                >
                  Grant Permissions
                </button>
                <button
                  onClick={() => refreshDevices()}
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

      {/* Invite Participants Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/60">
              <div className="flex items-center gap-2 text-white font-extrabold">
                <Users className="w-4 h-4 text-indigo-400" />
                Invite Participants
              </div>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-800 transition"
              >
                Close
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[300px] space-y-2.5">
              {inviteUsers.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-4">No active employees available to invite.</p>
              ) : (
                inviteUsers.map((u) => (
                  <label key={u.id} className="flex items-center gap-3 p-2 hover:bg-gray-900 rounded-xl cursor-pointer transition">
                    <input
                      type="checkbox"
                      checked={selectedInviteIds.includes(u.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedInviteIds(prev => [...prev, u.id]);
                        } else {
                          setSelectedInviteIds(prev => prev.filter(id => id !== u.id));
                        }
                      }}
                      className="rounded border-gray-800 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="text-left">
                      <p className="text-xs font-bold text-white">{u.name}</p>
                      <p className="text-[10px] text-gray-400 capitalize">{u.role} • {u.position || 'Employee'}</p>
                    </div>
                  </label>
                ))
              )}
            </div>

            <div className="p-4 border-t border-gray-800 flex justify-end gap-2 bg-gray-900/20">
              <button
                onClick={() => setShowInviteModal(false)}
                className="px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white text-xs font-bold transition border border-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSendInvites}
                disabled={selectedInviteIds.length === 0 || inviting}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition disabled:opacity-40"
              >
                {inviting ? 'Inviting...' : 'Send Invitations'}
              </button>
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
              onClick={leaveRoom}
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
            {recording && (
              <span className="flex items-center gap-1.5 text-[10px] sm:text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-2 sm:px-2.5 py-1 rounded-full font-bold animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span>
                REC • {formatElapsed(recordingDuration)}
              </span>
            )}
            <span className="hidden sm:flex items-center gap-1 text-[10px] sm:text-xs bg-indigo-600/10 text-indigo-300 border border-indigo-500/25 px-2 sm:px-2.5 py-1 rounded-full font-bold">
              Duration: {meeting.duration_minutes}m • Elapsed: {formatElapsed(meetingElapsedSec)}
            </span>
            <span className="hidden sm:flex items-center gap-1 text-[10px] sm:text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 sm:px-2.5 py-1 rounded-full font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
              SECURE
            </span>
          </div>
        </div>

        {/* Video / Avatar Grid */}
        <div className="flex-1 my-2 sm:my-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6 overflow-y-auto min-h-0 p-1 sm:p-2 items-center justify-center content-start sm:content-center">

          {/* Local participant feed */}
          <div className={`aspect-video bg-gray-950 border rounded-2xl relative overflow-hidden flex flex-col items-center justify-center shadow-lg group transition duration-300 ${isSpeakingLocal ? 'border-indigo-500 shadow-indigo-500/20' : 'border-gray-800 hover:border-indigo-500/50'}`}>
            {(cameraActive || screenSharing) ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full rounded-2xl ${screenSharing ? 'object-contain' : 'object-cover'}`}
              />
            ) : (
              <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-black border transition-colors ${isSpeakingLocal ? 'bg-indigo-600 border-indigo-400' : 'bg-indigo-650 border-transparent'}`}>
                {user?.name.charAt(0).toUpperCase()}
              </div>
            )}

            <div className="absolute bottom-3 left-3 bg-gray-900/80 backdrop-blur px-2.5 py-1 rounded-lg border border-gray-850 flex items-center gap-2 text-xs font-semibold text-white">
              <span>You</span>
              {!micActive && <MicOff className="w-3.5 h-3.5 text-red-500" />}
            </div>
          </div>

          {/* Active meeting participants list */}
          {activeMembers.filter(m => Number(m.id) !== Number(user?.id)).map(member => {
            const remoteStream = remoteStreams[member.id];
            const remoteVideoOn = peerVideoEnabled[member.id] ?? true;
            const peerMicOn = peerMicEnabled[member.id] ?? true;

            return (
              <RemoteParticipantTile
                key={member.id}
                member={member}
                remoteStream={remoteStream}
                remoteVideoOn={remoteVideoOn}
                peerMicEnabled={peerMicOn}
                toggleFullscreen={toggleFullscreen}
                applySpeakerToElement={applySpeakerToElement}
                setAudioBlocked={setAudioBlocked}
              />
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
              onClick={toggleMic}
              className={`p-2.5 sm:p-3 rounded-xl transition font-semibold border ${micActive
                ? 'bg-gray-800 hover:bg-gray-700 text-white border-gray-700'
                : 'bg-red-500/10 border-red-500/35 text-red-500 hover:bg-red-500/20'
                }`}
              title={micActive ? 'Mute Mic' : 'Unmute Mic'}
            >
              {micActive ? <Mic className="w-4 h-4 sm:w-5 sm:h-5" /> : <MicOff className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>

            <button
              onClick={toggleCamera}
              className={`p-2.5 sm:p-3 rounded-xl transition font-semibold border ${cameraActive
                ? 'bg-gray-800 hover:bg-gray-700 text-white border-gray-700'
                : 'bg-red-500/10 border-red-500/35 text-red-500 hover:bg-red-500/20'
                }`}
              title={cameraActive ? 'Turn Off Camera' : 'Turn On Camera'}
            >
              {cameraActive ? <Video className="w-4 h-4 sm:w-5 sm:h-5" /> : <VideoOff className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>

            <button
              onClick={toggleScreenShare}
              className={`p-2.5 sm:p-3 rounded-xl transition font-semibold border ${screenSharing
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
              onClick={() => {
                fetchInviteUsers();
                setShowInviteModal(true);
              }}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2 rounded-xl text-[10px] sm:text-xs font-bold transition border bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
              title="Invite Members"
            >
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Invite
            </button>

            <button
              onClick={recording ? stopRecording : startRecording}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-[10px] sm:text-xs font-bold transition border ${recording
                ? 'bg-red-500/20 border-red-500/35 text-red-400 hover:bg-red-500/30 animate-pulse'
                : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                }`}
              title={recording ? 'Stop Recording' : 'Record Meeting'}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${recording ? 'bg-red-500 animate-ping' : 'bg-gray-400'}`}></span>
              {recording ? 'Stop Rec' : 'Record'}
            </button>

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
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2 rounded-xl text-[10px] sm:text-xs font-bold transition border ${showChat
                ? 'bg-indigo-600/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-650/20'
                : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                }`}
            >
              <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Chat
            </button>

            {isHost && (
              <button
                onClick={endRoom}
                className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-red-655 hover:bg-red-700 text-white text-[10px] sm:text-xs font-black rounded-xl shadow-md transition"
              >
                <ShieldAlert className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>End for All</span>
              </button>
            )}

            <button
              onClick={leaveRoom}
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
                    <div className={`px-3 py-2 rounded-2xl text-xs max-w-[90%] break-words leading-relaxed ${isMe
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
