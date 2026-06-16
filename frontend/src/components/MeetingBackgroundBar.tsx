import { useNavigate } from 'react-router-dom';
import { useMeetingStore } from '../stores/meetingStore';
import { 
  Video, Mic, MicOff, VideoOff, PhoneOff, Monitor, Maximize2 
} from 'lucide-react';

export default function MeetingBackgroundBar() {
  const navigate = useNavigate();
  const {
    meeting,
    minimized,
    micActive,
    cameraActive,
    screenSharing,
    meetingElapsedSec,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    leaveRoom,
    setMinimized
  } = useMeetingStore();

  if (!meeting || !minimized) return null;

  const formatElapsed = (sec: number) => {
    const total = Math.max(0, Math.floor(sec));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleReenter = () => {
    setMinimized(false);
    navigate(`/meeting-room/${meeting.id}`);
  };

  return (
    <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 z-[9999] w-full max-w-xl px-4 sm:px-0">
      <div className="bg-gray-950/90 backdrop-blur-md border border-gray-800 rounded-2xl shadow-2xl p-4 flex items-center justify-between gap-4 text-white">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-indigo-400 font-bold tracking-wide uppercase">Active Meeting</p>
          <h4 className="text-sm font-black truncate max-w-[180px] sm:max-w-[240px]">{meeting.title}</h4>
          <span className="text-[10px] text-gray-400 font-mono bg-gray-900 px-1.5 py-0.5 rounded">
            {formatElapsed(meetingElapsedSec)}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleMic}
            className={`p-2 rounded-xl border transition ${
              micActive 
                ? 'bg-gray-800 border-gray-700 hover:bg-gray-750 text-white' 
                : 'bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30'
            }`}
            title={micActive ? 'Mute Microphone' : 'Unmute Microphone'}
          >
            {micActive ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </button>

          <button
            onClick={toggleCamera}
            className={`p-2 rounded-xl border transition ${
              cameraActive 
                ? 'bg-gray-800 border-gray-700 hover:bg-gray-750 text-white' 
                : 'bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30'
            }`}
            title={cameraActive ? 'Turn Camera Off' : 'Turn Camera On'}
          >
            {cameraActive ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
          </button>

          <button
            onClick={toggleScreenShare}
            className={`p-2 rounded-xl border transition ${
              screenSharing 
                ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-400 hover:bg-indigo-650/30' 
                : 'bg-gray-800 border-gray-700 hover:bg-gray-750 text-white'
            }`}
            title={screenSharing ? 'Stop Screen Share' : 'Share Screen'}
          >
            <Monitor className="w-4 h-4" />
          </button>

          <button
            onClick={handleReenter}
            className="p-2 rounded-xl border bg-indigo-650 hover:bg-indigo-700 border-indigo-600 transition text-white"
            title="Re-enter Room"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          <button
            onClick={leaveRoom}
            className="p-2 rounded-xl border bg-red-655 hover:bg-red-700 border-red-600 transition text-white"
            title="Leave Meeting"
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
