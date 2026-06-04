import { useEffect, useRef, useState } from 'react';
import { useVoiceStore } from '../stores/voiceStore';
import { 
  Phone, 
  PhoneOff, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Loader2
} from 'lucide-react';

export default function VoiceCallBar() {
  const {
    callState,
    callerName,
    recipientName,
    remoteStream,
    isMuted,
    isSpeakerOn,
    remoteAccepted,
    debugRunId,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleSpeaker,
  } = useVoiceStore();

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

  const report = (point: string, payload: Record<string, any>) => {
    try {
      const { enabled, url, session } = getVoiceDebugConfig();
      if (!enabled) return;
      const event = {
        sessionId: session,
        ts: Date.now(),
        point,
        payload: { runId: debugRunId, ...payload }
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

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [duration, setDuration] = useState(0);
  const [audioBlocked, setAudioBlocked] = useState(false);

  // Auto-play remote audio stream
  useEffect(() => {
    if (audioRef.current && remoteStream) {
      audioRef.current.srcObject = remoteStream;
      audioRef.current.play().then(() => {
        setAudioBlocked(false);
        report('voice.audio.play.ok', { isSpeakerOn });
      }).catch(err => {
        const name = err?.name ? String(err.name) : '';
        if (name === 'NotAllowedError' || name === 'AbortError') {
          setAudioBlocked(true);
        }
        report('voice.audio.play.error', {
          name,
          message: err?.message ? String(err.message) : String(err),
          isSpeakerOn,
        });
      });
    }
  }, [remoteStream, isSpeakerOn]);

  // Call duration counter
  useEffect(() => {
    if (callState !== 'connected') {
      setDuration(0);
      return;
    }

    const timer = setInterval(() => {
      setDuration(prev => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [callState]);

  if (callState === 'idle') return null;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const name = callState === 'incoming' ? callerName : recipientName;
  const canPromptAudio = callState === 'connected' && !!remoteStream && isSpeakerOn;
  const statusText =
    callState === 'calling'
      ? (remoteAccepted ? 'Connecting...' : 'Dialing...')
      : callState === 'incoming'
        ? 'Incoming Voice Call'
        : callState === 'connected'
          ? `In Call • ${formatDuration(duration)}`
          : '';

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4">
      {/* Audio element must ALWAYS be in DOM, not conditionally rendered */}
      <audio 
        ref={audioRef} 
        autoPlay 
        playsInline 
        muted={!isSpeakerOn} 
        style={{ position: 'fixed', top: '-9999px', left: '-9999px' }}
      />

      <div className="bg-gray-900/95 dark:bg-gray-950/95 backdrop-blur-md border border-gray-800 text-white rounded-2xl p-4 shadow-2xl flex flex-col items-center gap-4 animate-in fade-in slide-in-from-bottom-8 duration-300">
        
        {/* Call Info header */}
        <div className="flex items-center gap-3 w-full">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-indigo-600 ${
            callState === 'incoming' || callState === 'calling' ? 'animate-pulse' : ''
          }`}>
            <Phone className="w-5 h-5 text-white" />
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm truncate">{name}</h4>
            <p className="text-xs text-gray-400 capitalize">
              {statusText}
            </p>
          </div>

          {canPromptAudio && audioBlocked && (
            <button
              onClick={() => {
                const el = audioRef.current;
                if (!el) return;
                el.play().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
              }}
              className="shrink-0 text-[10px] sm:text-xs px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
              title="Enable audio playback"
            >
              Enable Audio
            </button>
          )}

          {callState === 'calling' && (
            <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-4 justify-center w-full border-t border-gray-800/80 pt-3">
          
          {callState === 'incoming' ? (
            <>
              {/* Accept & Reject buttons */}
              <button
                onClick={rejectCall}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-red-600 hover:bg-red-700 text-white transition hover:scale-105"
                title="Decline"
              >
                <PhoneOff className="w-5 h-5" />
              </button>

              <button
                onClick={acceptCall}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-green-600 hover:bg-green-700 text-white transition hover:scale-105 animate-bounce"
                title="Accept"
              >
                <Phone className="w-5 h-5" />
              </button>
            </>
          ) : (
            <>
              {/* Connected / Calling controls */}
              <button
                onClick={toggleMute}
                disabled={callState !== 'connected'}
                className={`flex items-center justify-center w-10 h-10 rounded-full border transition ${
                  callState !== 'connected' ? 'border-gray-800 text-gray-600 cursor-not-allowed' :
                  isMuted 
                    ? 'bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500/20' 
                    : 'border-gray-700 text-gray-300 hover:bg-gray-800'
                }`}
                title={isMuted ? 'Unmute Mic' : 'Mute Mic'}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              <button
                onClick={toggleSpeaker}
                disabled={callState !== 'connected'}
                className={`flex items-center justify-center w-10 h-10 rounded-full border transition ${
                  callState !== 'connected' ? 'border-gray-800 text-gray-600 cursor-not-allowed' :
                  !isSpeakerOn 
                    ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/20' 
                    : 'border-gray-700 text-gray-300 hover:bg-gray-800'
                }`}
                title={isSpeakerOn ? 'Mute Speaker' : 'Unmute Speaker'}
              >
                {!isSpeakerOn ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>

              <button
                onClick={callState === 'calling' ? rejectCall : endCall}
                className="flex items-center justify-center w-12 h-10 rounded-xl bg-red-600 hover:bg-red-700 text-white transition hover:scale-105"
                title="Hang Up"
              >
                <PhoneOff className="w-5 h-5" />
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
