import { useMeetingInviteStore } from '../stores/meetingInviteStore';
import { useNavigate } from 'react-router-dom';
import { Video, X } from 'lucide-react';

export default function JoinMeetingPopup() {
  const { activeInvite, setInvite } = useMeetingInviteStore();
  const navigate = useNavigate();

  if (!activeInvite) return null;

  const handleJoin = () => {
    const id = activeInvite.meetingId;
    setInvite(null);
    navigate(`/meeting-room/${id}`);
  };

  const handleDismiss = () => {
    setInvite(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 w-full max-w-md overflow-hidden transform transition-all scale-100 animate-slide-up">
        {/* Header decoration */}
        <div className="bg-blue-600 p-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <Video className="w-5 h-5 animate-pulse" />
            <span>Meeting Starting Now</span>
          </div>
          <button 
            onClick={handleDismiss}
            className="text-white/80 hover:text-white transition rounded-full p-1 hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex h-3.5 w-3.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500"></span>
            </span>
            <span className="text-xs font-bold text-red-500 dark:text-red-400 uppercase tracking-wider">Live Now</span>
          </div>

          <div className="space-y-1">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white leading-snug">
              {activeInvite.title}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Host: <span className="font-medium text-gray-700 dark:text-gray-300">{activeInvite.hostName}</span>
            </p>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-300">
            The meeting organizer has started this call. Join now to participate in the conversation.
          </p>

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleDismiss}
              className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold text-sm rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              Dismiss
            </button>
            <button
              onClick={handleJoin}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-semibold text-sm rounded-xl hover:bg-blue-700 active:bg-blue-800 transition shadow-lg shadow-blue-500/20"
            >
              Join Meeting
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
