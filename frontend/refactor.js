const fs = require('fs');
let code = fs.readFileSync('src/pages/TimeTracking.tsx', 'utf8');

// 1. trackerCore definition
code = code.replace(
  'isTracking: false,',
  'isTracking: false,\n  isPaused: false,\n  pausedTimeLogId: undefined as number | undefined,'
);

// 2. trackerCore cleanup
code = code.replace(
  'this.isTracking = false;\n    this.permissionGranted = false;',
  'this.isTracking = false;\n    this.isPaused = false;\n    this.pausedTimeLogId = undefined;\n    this.permissionGranted = false;'
);

// 3. React States
code = code.replace(
  '  const [isTracking, setIsTracking] = useState((window as TTWindow).__tt_core.isTracking);\n  const isTrackingRef = useRef(isTracking);\n  useEffect(() => {\n    isTrackingRef.current = isTracking;\n    (window as TTWindow).__tt_core.isTracking = isTracking;\n  }, [isTracking]);',
  \  const [isTracking, setIsTracking] = useState((window as TTWindow).__tt_core.isTracking);
  const isTrackingRef = useRef(isTracking);
  useEffect(() => {
    isTrackingRef.current = isTracking;
    (window as TTWindow).__tt_core.isTracking = isTracking;
  }, [isTracking]);

  const [isPaused, setIsPaused] = useState((window as TTWindow).__tt_core.isPaused);
  useEffect(() => { (window as TTWindow).__tt_core.isPaused = isPaused; }, [isPaused]);

  const [pausedTimeLogId, setPausedTimeLogId] = useState<number | undefined>((window as TTWindow).__tt_core.pausedTimeLogId);
  useEffect(() => { (window as TTWindow).__tt_core.pausedTimeLogId = pausedTimeLogId; }, [pausedTimeLogId]);\
);

// 4. LocalStorage parse in tick
code = code.replace(
  'const parsed = JSON.parse(raw) as { isTracking: boolean; startAt?: string; note?: string; timeLogId?: number; lastHeartbeat?: string };\\n          if (parsed.isTracking && parsed.startAt) {',
  'const parsed = JSON.parse(raw) as { isTracking: boolean; isPaused?: boolean; startAt?: string; note?: string; timeLogId?: number; lastHeartbeat?: string };\\n          if (parsed.isTracking && !parsed.isPaused && parsed.startAt) {'
);

// 5. LocalStorage Interface
code = code.replace(
  '            isTracking: boolean;\n            startAt?: string;',
  '            isTracking: boolean;\n            isPaused?: boolean;\n            pausedTimeLogId?: number;\n            startAt?: string;'
);

// 6. Resume logic in useEffect
code = code.replace(
  '          if (parsed.isTracking && parsed.startAt && !core.isTracking) {\n            // Resume normally',
  \          if (parsed.isTracking && !core.isTracking) {
            if (parsed.isPaused) {
              setIsPaused(true);
              core.isPaused = true;
              if (parsed.pausedTimeLogId) {
                setPausedTimeLogId(parsed.pausedTimeLogId);
                core.pausedTimeLogId = parsed.pausedTimeLogId;
              }
              const pId = parsed.projectId ? Number(parsed.projectId) : undefined;
              setSelectedProjectId(pId);
              core.projectId = pId;
              const tId = parsed.taskId ? Number(parsed.taskId) : undefined;
              setSelectedTaskId(tId);
              core.taskId = tId;
              setNote(parsed.note ?? '');
              core.note = parsed.note ?? '';
            } else if (parsed.startAt) {
              // Resume normally\
);

// Close the resume logic block
code = code.replace(
  '            if (core.stream) {\n              startShotSchedule();\n              startVisualActivityCheck();\n            }\n          }',
  \            if (core.stream) {
              startShotSchedule();
              startVisualActivityCheck();
            }
          }
          }\
);

fs.writeFileSync('src/pages/TimeTracking.tsx', code);
