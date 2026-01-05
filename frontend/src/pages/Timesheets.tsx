import { useMemo, useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usersAPI } from '../api/users';
import { timeTrackingAPI } from '../api/timeTracking';
import { useAuthStore } from '../stores/authStore';
import type { TimeLog, User, Screenshot } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import { toast } from 'sonner';

export default function Timesheets() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState<number | undefined>(undefined);
  const [startDate, setStartDate] = useState<string>(() => new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [selectedLog, setSelectedLog] = useState<TimeLog | null>(null);
  const [selectedShot, setSelectedShot] = useState<Screenshot | null>(null);
  const [isLiveWatching, setIsLiveWatching] = useState(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    let interval: number;
    let keepAliveInterval: number;
    let signalInterval: number;
    
    if (isLiveWatching && selectedLog && !selectedLog.end_time && employeeId) {
       // Refresh screenshots (keep existing logic as fallback or history)
       interval = window.setInterval(() => {
          queryClient.invalidateQueries({ queryKey: ['timesheets', 'shots', employeeId] });
       }, 10000); // Slower refresh for history
       
       // Keep live session alive
       keepAliveInterval = window.setInterval(() => {
          usersAPI.triggerLive(employeeId).catch(() => {
             toast.error('Live session disconnected');
             setIsLiveWatching(false);
          });
       }, 45000); 

       // Polling for signaling (Answer & Candidates)
       signalInterval = window.setInterval(async () => {
           if (!pcRef.current) return;
           
           try {
               // Check for Answer if not set
               if (pcRef.current.signalingState === 'have-local-offer') {
                   const answer = await usersAPI.getSignal(employeeId, 'answer');
                   if (answer && answer.sdp) {
                       await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
                   }
               }
               
               // Check for Candidates
               if (pcRef.current.remoteDescription) {
                   const candidates = await usersAPI.getSignal(employeeId, 'candidate');
                   if (candidates && Array.isArray(candidates)) {
                       for (const cand of candidates) {
                           if (cand.candidate) {
                               try {
                                   await pcRef.current.addIceCandidate(cand.candidate);
                               } catch (e) { console.warn(e); }
                           }
                       }
                   }
               }
           } catch (e) { console.warn(e); }
       }, 2000);
    }
    return () => {
       window.clearInterval(interval);
       window.clearInterval(keepAliveInterval);
       window.clearInterval(signalInterval);
       
       if (pcRef.current) {
           pcRef.current.close();
           pcRef.current = null;
       }
    };
  }, [isLiveWatching, selectedLog, employeeId, queryClient]);

  const handleLiveToggle = async () => {
    if (!employeeId) return;
    if (!isLiveWatching) {
      try {
        await usersAPI.triggerLive(employeeId);
        setIsLiveWatching(true);
        toast.success('Live View requested. Connecting...');
        
        // Init WebRTC
        if (pcRef.current) {
            pcRef.current.close();
        }

        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        pcRef.current = pc;
        
        pc.addTransceiver('video', { direction: 'recvonly' });
        
        pc.ontrack = (event) => {
            console.log('Stream received', event.streams);
            if (videoRef.current && event.streams[0]) {
                videoRef.current.srcObject = event.streams[0];
                videoRef.current.play().catch(e => console.error('Auto-play failed', e));
            }
        };

        pc.onconnectionstatechange = () => {
             console.log('Connection State:', pc.connectionState);
             if (pc.connectionState === 'connected') {
                 toast.success('Stream Connected');
             } else if (pc.connectionState === 'failed') {
                 toast.error('Connection Failed. Retrying...');
             }
        };
        
        pc.onicecandidate = (event) => {
             if (event.candidate) {
                 usersAPI.signal(employeeId, { type: 'candidate', candidate: event.candidate });
             }
        };
        
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await usersAPI.signal(employeeId, { type: 'offer', sdp: offer.sdp });
        
      } catch (e) {
        toast.error('Failed to start Live View');
      }
    } else {
      try {
        await usersAPI.stopLive(employeeId);
        toast.info('Live View Stopped');
      } catch (e) {
        console.error(e);
      }
      setIsLiveWatching(false);
      if (pcRef.current) {
          pcRef.current.close();
          pcRef.current = null;
      }
    }
  };

  const { data: employees, isLoading: loadingEmployees } = useQuery<{ data: User[] }>({
    queryKey: ['employees', 'timesheets', search],
    queryFn: () => usersAPI.getUsers({ role: 'employee', search, page: 1 }),
  });

  const { data: timeLogs, isLoading: loadingLogs } = useQuery<TimeLog[]>({
    queryKey: ['timesheets', 'logs', employeeId, startDate, endDate],
    queryFn: () => employeeId ? timeTrackingAPI.getUserTimeLogsAdmin(employeeId, { start_date: startDate, end_date: endDate }) : Promise.resolve([]),
    enabled: !!employeeId,
  });

  const { data: screenshots, isLoading: loadingShots } = useQuery<Screenshot[]>({
    queryKey: ['timesheets', 'shots', employeeId, startDate, endDate],
    queryFn: () => employeeId ? timeTrackingAPI.getUserScreenshotsAdmin(employeeId, { start_date: startDate, end_date: endDate }) : Promise.resolve([]),
    enabled: !!employeeId,
  });

  const activityRange = useMemo(() => {
    if (!selectedLog) return null;
    const start = selectedLog.start_time;
    // If active (no end_time), show up to NOW (plus buffer)
    const end = selectedLog.end_time 
      ? selectedLog.end_time 
      : new Date().toISOString();
      
    return { start, end };
  }, [selectedLog, screenshots]); // Add screenshots as dep to update "now" effectively when shots refresh

  const fixDate = (dateStr: string) => {
    // Standard parse - the browser will convert UTC (Z) to local time automatically
    return new Date(dateStr);
  };

  const logScreenshots = useMemo(() => {
    if (!selectedLog || !screenshots || !activityRange) return [];
    
    const start = fixDate(activityRange.start).getTime();
    const end = fixDate(activityRange.end).getTime();
    
    return screenshots.filter(s => {
      const t = fixDate(s.captured_at).getTime();
      return t >= start - 1000 && t <= end + 1000;
    }).sort((a, b) => {
      const tA = new Date(a.captured_at).getTime();
      const tB = new Date(b.captured_at).getTime();
      return sortOrder === 'asc' ? tA - tB : tB - tA;
    });
  }, [selectedLog, screenshots, activityRange, sortOrder]);



  const groupedByDate = useMemo(() => {
    const map: Record<string, { total: number; logs: TimeLog[] }> = {};
    
    (timeLogs ?? []).forEach((log) => {
      const key = log.start_time.slice(0, 10);
      if (!map[key]) map[key] = { total: 0, logs: [] };
      map[key].logs.push(log);
      map[key].total += log.duration ?? 0;
    });

    (screenshots ?? []).forEach((shot) => {
      const key = shot.captured_at.slice(0, 10);
      if (!map[key]) map[key] = { total: 0, logs: [] };
    });

    return Object.entries(map).sort((a, b) => a[0] < b[0] ? 1 : -1);
  }, [timeLogs, screenshots]);

  if (!user || user.role !== 'admin') {
    return <div className="py-8 text-center text-gray-500">Only admins can view timesheets.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Timesheets</h1>
      </div>

      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Employee</label>
            <div className="flex gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search employees"
                className="mt-1 block w-1/2 border rounded px-3 py-2"
              />
              <select
                value={employeeId ?? ''}
                onChange={(e) => setEmployeeId(e.target.value ? Number(e.target.value) : undefined)}
                className="mt-1 block w-full border rounded px-3 py-2"
              >
                <option value="">Select employee</option>
                {(employees?.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Start date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">End date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>
        </div>

        {(loadingEmployees || loadingLogs || loadingShots) && <LoadingSpinner className="h-24" />}

        {employeeId && (timeLogs?.length ?? 0) === 0 && !loadingLogs && (
          <p className="text-sm text-gray-500">No time logs for selected period.</p>
        )}

        {groupedByDate.length > 0 && (
          <div className="space-y-6">
            {groupedByDate.map(([date, info]) => (
              <div key={date} className="border rounded-lg">
                <div className="flex items-center justify-between bg-gray-50 px-4 py-2">
                  <div className="font-medium">{date}</div>
                  <div className="text-sm text-gray-600">Total: {Math.round((info.total ?? 0) / 60 * 100) / 100} h</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Project</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Start</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">End</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration (min)</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Note</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {info.logs.map((log) => (
                        <tr key={log.id}>
                          <td className="px-4 py-2 text-sm text-gray-900">{log.project?.name ?? '-'}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{log.task?.title ?? '-'}</td>
                          <td className="px-4 py-2 text-sm text-gray-500">{fixDate(log.start_time).toLocaleString()}</td>
                          <td className="px-4 py-2 text-sm text-gray-500">{log.end_time ? fixDate(log.end_time).toLocaleString() : '-'}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{log.duration ?? '-'}</td>
                          <td className="px-4 py-2 text-sm text-gray-500">{log.description ?? '-'}</td>
                          <td className="px-4 py-2 text-right">
                            <button
                              onClick={() => setSelectedLog(log)}
                              className="px-2 py-1 text-xs rounded bg-indigo-50 text-indigo-700 border border-indigo-200"
                            >Activity</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* <div className="px-4 py-3">
                  <div className="text-sm font-medium text-gray-700 mb-2">Screenshots</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {(screenshots ?? []).filter((s) => s.captured_at.slice(0,10) === date).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedShot(s)}
                        className="block focus:outline-none"
                        aria-label={`Open screenshot ${s.file_name}`}
                      >
                        <img src={s.url ?? s.file_path} alt={s.file_name} className="w-full h-24 object-cover rounded border" />
                      </button>
                    ))}
                  </div>
                </div> */}
              </div>
            ))}
          </div>
        )}
      </div>
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0 bg-white rounded-t-lg">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Activity Details</h3>
                  <div className="text-sm text-gray-500 mt-1">
                    {fixDate(selectedLog.start_time).toLocaleString()} – {selectedLog.end_time ? fixDate(selectedLog.end_time).toLocaleString() : 'In Progress'}
                  </div>
                </div>
                <div className="flex items-center">
                  <div className="mr-4 flex items-center border rounded overflow-hidden">
                    <button
                      onClick={() => setSortOrder('asc')}
                      className={`px-3 py-1 text-sm ${sortOrder === 'asc' ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                    >
                      Oldest First
                    </button>
                    <div className="w-px h-full bg-gray-200"></div>
                    <button
                      onClick={() => setSortOrder('desc')}
                      className={`px-3 py-1 text-sm ${sortOrder === 'desc' ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                    >
                      Newest First
                    </button>
                  </div>

                  {!selectedLog.end_time && (
                    <button 
                      onClick={handleLiveToggle}
                      className={`mr-4 px-3 py-1 rounded text-sm font-medium transition-colors ${isLiveWatching ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
                    >
                      {isLiveWatching ? 'Stop Live View' : 'Watch Live'}
                    </button>
                  )}
                  <button 
                    onClick={async () => { 
                      if (isLiveWatching && employeeId) {
                        try { await usersAPI.stopLive(employeeId); } catch(e){}
                      }
                      setSelectedLog(null); 
                      setIsLiveWatching(false); 
                    }} 
                    className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
                    aria-label="Close"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {isLiveWatching && (
                  <div className="mb-6 bg-black rounded-lg overflow-hidden shadow-lg aspect-video flex items-center justify-center relative group">
                      <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        muted
                        controls 
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute top-4 right-4 bg-red-600 text-white px-2 py-1 rounded text-xs animate-pulse">
                          LIVE
                      </div>
                  </div>
              )}

              {logScreenshots.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {logScreenshots.map(shot => {
                    const stats = shot.minute_breakdown?.reduce((acc, curr) => ({
                      keyboard: acc.keyboard + (curr.keyboard_clicks || 0),
                      mouse: acc.mouse + (curr.mouse_clicks || 0),
                      scroll: acc.scroll + (curr.mouse_scrolls || 0),
                      movement: acc.movement + (curr.mouse_movements || 0),
                      total: acc.total + (curr.total_activity || 0)
                    }), { keyboard: 0, mouse: 0, scroll: 0, movement: 0, total: 0 });

                    return (
                      <div key={shot.id} className="border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                         <div 
                           className="cursor-pointer relative group"
                           onClick={() => setSelectedShot(shot)}
                         >
                           <img 
                             src={shot.url ?? shot.file_path} 
                             alt={shot.file_name} 
                             className="w-full h-48 object-cover group-hover:opacity-95 transition-opacity" 
                           />
                           <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 transition-colors">
                             <div className="opacity-0 group-hover:opacity-100 bg-black/50 text-white text-xs px-2 py-1 rounded">
                               View Full
                             </div>
                           </div>
                         </div>
                         
                         <div className="p-3 bg-white">
                           <div className="flex justify-between items-center mb-3">
                              <span className="font-medium text-sm text-gray-900">{new Date(shot.captured_at).toLocaleTimeString()}</span>
                              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                Total: {stats?.total || 0}
                              </span>
                           </div>

                           {stats ? (
                             <>
                             <div className="grid grid-cols-4 gap-2 text-center mb-3">
                               <div className="bg-blue-50 p-1.5 rounded">
                                 <div className="font-bold text-blue-700 text-sm">{stats.mouse}</div>
                                 <div className="text-[10px] text-blue-600 uppercase font-semibold">Clicks</div>
                               </div>
                               <div className="bg-purple-50 p-1.5 rounded">
                                 <div className="font-bold text-purple-700 text-sm">{stats.keyboard}</div>
                                 <div className="text-[10px] text-purple-600 uppercase font-semibold">Keys</div>
                               </div>
                               <div className="bg-green-50 p-1.5 rounded">
                                 <div className="font-bold text-green-700 text-sm">{stats.scroll}</div>
                                 <div className="text-[10px] text-green-600 uppercase font-semibold">Scrolls</div>
                               </div>
                               <div className="bg-orange-50 p-1.5 rounded">
                                 <div className="font-bold text-orange-700 text-sm">{stats.movement}</div>
                                 <div className="text-[10px] text-orange-600 uppercase font-semibold">Moves</div>
                               </div>
                             </div>
                             
                             {shot.minute_breakdown && shot.minute_breakdown.length > 0 && (
                               <div className="space-y-1 bg-gray-50 p-2 rounded max-h-32 overflow-y-auto border border-gray-100 text-xs">
                                 {shot.minute_breakdown.map((m, i) => (
                                   <div key={i} className="flex justify-between items-center py-1 border-b border-gray-200 last:border-0">
                                     <span className="text-gray-600 font-mono">{m.time}</span>
                                     <div className="flex gap-2 font-medium text-gray-800">
                                       <span title="Mouse Clicks" className="flex items-center gap-0.5">
                                         <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>{m.mouse_clicks}
                                       </span>
                                       <span title="Keyboard Clicks" className="flex items-center gap-0.5">
                                         <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>{m.keyboard_clicks}
                                       </span>
                                       <span title="Mouse Scrolls" className="flex items-center gap-0.5">
                                          <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>{m.mouse_scrolls || 0}
                                       </span>
                                       <span title="Mouse Movements" className="flex items-center gap-0.5">
                                          <span className="w-1.5 h-1.5 rounded-full bg-orange-400"></span>{m.mouse_movements || 0}
                                       </span>
                                     </div>
                                   </div>
                                 ))}
                               </div>
                             )}
                             </>
                           ) : (
                             <div className="text-center italic text-gray-400 py-2 text-xs">No activity data</div>
                           )}
                         </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                  <svg className="w-12 h-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-lg font-medium">No screenshots recorded</p>
                  <p className="text-sm">No activity data available for this time log.</p>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t bg-gray-50 rounded-b-lg flex justify-end sticky bottom-0 z-10">
              <button 
                onClick={() => setSelectedLog(null)} 
                className="px-4 py-2 rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium shadow-sm transition-colors"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
      {selectedShot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setSelectedShot(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div>
                <div className="font-semibold">Screenshot</div>
                <div className="text-xs text-gray-500">{new Date(selectedShot.captured_at).toLocaleString()}</div>
              </div>
              <button onClick={() => setSelectedShot(null)} className="px-2 py-1 text-sm rounded bg-gray-100 text-gray-700">Close</button>
            </div>
            <div className="p-4">
              <img src={selectedShot.url ?? selectedShot.file_path} alt={selectedShot.file_name} className="max-w-[85vw] max-h-[75vh] object-contain rounded" />
            </div>
          </div>
        </div>
      )}
    </div>
);
}
