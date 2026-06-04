import { useState } from 'react';
import { Calendar, Clock, User, CheckCircle2, XCircle, AlertCircle, Play, Square, Video, Trash2, Edit } from 'lucide-react';
import type { Meeting } from '../types/meetings';
import { useAuthStore } from '../stores/authStore';

interface MeetingCardProps {
  meeting: Meeting;
  onRespond: (id: number, status: 'accepted' | 'declined') => void;
  onStart: (id: number) => void;
  onEnd: (id: number) => void;
  onJoin: (id: number) => void;
  onCancel: (id: number) => void;
  onEdit?: (meeting: Meeting) => void;
}

export default function MeetingCard({
  meeting,
  onRespond,
  onStart,
  onEnd,
  onJoin,
  onCancel,
  onEdit
}: MeetingCardProps) {
  const { user } = useAuthStore();
  const [isResponding, setIsResponding] = useState(false);

  const isHost = meeting.created_by === user?.id;
  const myParticipantRecord = meeting.participants.find(p => p.id === user?.id);
  const myResponse = myParticipantRecord?.pivot?.status || 'invited';

  const scheduledDate = new Date(meeting.scheduled_at);
  const formattedDate = scheduledDate.toLocaleDateString(undefined, { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  const formattedTime = scheduledDate.toLocaleTimeString(undefined, { 
    hour: 'numeric', 
    minute: '2-digit' 
  });

  const formatDuration = (totalSec: number) => {
    const total = Math.max(0, Math.floor(totalSec));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const actualDurationText = (() => {
    if (meeting.status !== 'completed') return null;
    if (!meeting.started_at || !meeting.ended_at) return null;
    const start = Date.parse(meeting.started_at);
    const end = Date.parse(meeting.ended_at);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    return formatDuration((end - start) / 1000);
  })();

  // Colors for different types
  const typeBadgeColors = {
    team: 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/30',
    one_on_one: 'bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800/30',
    department: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/30',
  };

  const getStatusBadge = () => {
    switch (meeting.status) {
      case 'live':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-rose-500 text-white animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
            LIVE
          </span>
        );
      case 'completed':
        return (
          <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
            Completed
          </span>
        );
      case 'cancelled':
        return (
          <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-red-150 text-red-800 dark:bg-red-950/20 dark:text-red-400">
            Cancelled
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-800/30">
            Scheduled
          </span>
        );
    }
  };

  const handleResponse = async (status: 'accepted' | 'declined') => {
    setIsResponding(true);
    try {
      await onRespond(meeting.id, status);
    } finally {
      setIsResponding(false);
    }
  };

  return (
    <div className="group bg-white dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800/60 rounded-[1.5rem] shadow-sm hover:shadow-2xl hover:border-indigo-200 dark:hover:border-indigo-500/30 transition-all duration-300 overflow-hidden flex flex-col justify-between h-full backdrop-blur-sm relative">
      {/* Top gradient line */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      
      {/* Header Info */}
      <div className="p-6 flex-1">
        <div className="flex justify-between items-start gap-4 mb-4">
          <span className={`px-3 py-1 text-[10px] font-black tracking-widest uppercase rounded-lg border ${typeBadgeColors[meeting.type]}`}>
            {meeting.type.replace('_', ' ')}
          </span>
          {getStatusBadge()}
        </div>

        <h3 className="text-xl font-black text-gray-900 dark:text-white line-clamp-1 mb-2 tracking-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
          {meeting.title}
        </h3>

        {meeting.description && (
          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-5 leading-relaxed">
            {meeting.description}
          </p>
        )}

        {/* Meeting Details */}
        <div className="space-y-2.5 mb-5 p-4 rounded-2xl bg-gray-50/50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-800 text-[13px] text-gray-600 dark:text-gray-300">
          <div className="flex items-center gap-2.5">
            <Calendar className="w-4 h-4 text-indigo-500" />
            <span className="font-medium">{formattedDate} at <span className="text-gray-900 dark:text-white font-bold">{formattedTime}</span></span>
          </div>
          <div className="flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-purple-500" />
            <span className="font-medium">{actualDurationText ? actualDurationText : `${meeting.duration_minutes} minutes`}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <User className="w-4 h-4 text-emerald-500" />
            <span className="font-medium">
              Organized by <strong className="font-bold text-gray-900 dark:text-white">{isHost ? 'You' : meeting.creator?.name}</strong>
            </span>
          </div>
        </div>

        {/* Participants summary */}
        <div className="pt-2">
          <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest block mb-3">
            Participants ({meeting.participants.length})
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {meeting.participants.map(p => {
              const role = p.pivot?.role;
              const status = p.pivot?.status;
              let statusBorder = 'border-gray-200';
              if (status === 'accepted') statusBorder = 'border-green-400 ring-2 ring-green-100 dark:ring-green-950/20';
              if (status === 'declined') statusBorder = 'border-red-400 ring-2 ring-red-100 dark:ring-red-950/20';
              if (status === 'joined') statusBorder = 'border-indigo-400 ring-2 ring-indigo-100 dark:ring-indigo-950/20';

              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold shadow-sm bg-white dark:bg-gray-800 border ${statusBorder}`}
                  title={`${p.name} (${role}) - ${status}`}
                >
                  <span className="max-w-[100px] truncate">{p.name}</span>
                  {role === 'host' && (
                    <span className="text-[9px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">
                      Host
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer action bar */}
      <div className="px-6 py-4 bg-gray-50/80 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-800/60 flex flex-wrap gap-3 items-center justify-between">
        {/* RSVP status/actions */}
        {!isHost && meeting.status === 'scheduled' && (
          <div className="flex items-center gap-2">
            {myResponse === 'invited' ? (
              <>
                <button
                  disabled={isResponding}
                  onClick={() => handleResponse('declined')}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition"
                >
                  Decline
                </button>
                <button
                  disabled={isResponding}
                  onClick={() => handleResponse('accepted')}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition"
                >
                  Accept
                </button>
              </>
            ) : (
              <div className="flex items-center gap-1.5">
                {myResponse === 'accepted' ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-green-600">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Accepted
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-semibold text-red-500">
                    <XCircle className="w-3.5 h-3.5" /> Declined
                  </span>
                )}
                <button
                  onClick={() => handleResponse(myResponse === 'accepted' ? 'declined' : 'accepted')}
                  className="text-xs text-gray-400 hover:text-indigo-600 underline ml-2"
                >
                  Change
                </button>
              </div>
            )}
          </div>
        )}

        {isHost && meeting.status === 'scheduled' && (
          <div className="flex items-center gap-1.5">
            {onEdit && (
              <button
                onClick={() => onEdit(meeting)}
                className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-white rounded-lg transition border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                title="Edit Meeting"
              >
                <Edit className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => onCancel(meeting.id)}
              className="p-2 text-gray-500 hover:text-red-600 hover:bg-white rounded-lg transition border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
              title="Cancel Meeting"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Status indicator if not taking action */}
        {meeting.status === 'completed' && (
          <span className="text-xs text-gray-400 font-medium">{actualDurationText ? `Meeting Ended • ${actualDurationText}` : 'Meeting Ended'}</span>
        )}

        {meeting.status === 'cancelled' && (
          <span className="text-xs text-red-400 font-medium flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" /> Cancelled
          </span>
        )}

        {/* Live/Action Buttons */}
        <div className="ml-auto">
          {meeting.status === 'scheduled' && isHost && (
            <button
              onClick={() => onStart(meeting.id)}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl shadow-md shadow-indigo-500/20 transition-all hover:-translate-y-0.5"
            >
              <Play className="w-3.5 h-3.5" fill="currentColor" /> Start Meeting
            </button>
          )}

          {meeting.status === 'live' && (
            <div className="flex gap-2">
              <button
                onClick={() => onJoin(meeting.id)}
                className="flex items-center gap-2 px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-black rounded-xl shadow-md shadow-rose-500/20 transition-all hover:-translate-y-0.5"
              >
                <Video className="w-4 h-4" /> Join Room
              </button>
              {isHost && (
                <button
                  onClick={() => onEnd(meeting.id)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-900 text-gray-300 hover:text-white text-xs font-bold rounded-xl transition border border-gray-700"
                  title="End Meeting for all"
                >
                  <Square className="w-3.5 h-3.5 text-rose-500" fill="currentColor" /> End
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
