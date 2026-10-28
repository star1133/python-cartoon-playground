import type { TraceEvent, Value } from '../runtime/types';

export interface PlaybackState {
  status: 'idle' | 'initializing' | 'running' | 'paused' | 'waiting_input' | 'done' | 'stopped' | 'error';
  executionStatus: 'idle' | 'initializing' | 'running' | 'paused' | 'waiting_input' | 'done' | 'stopped' | 'error';
  isExecutionDone: boolean;
  isPlaying: boolean;
  mode: 'normal' | 'slow';
  speed: number; // 0.5 | 1 | 2 | 4
  events: TraceEvent[];
  currentIndex: number; // -1 when no events
  sourceSnapshot: string;
  currentCode: string;
  activeLine: number;
  currentEvent: TraceEvent | null;
  activeLocals: Record<string, Value>;
  activeStack: string[];
  errorMessage: string | null;
  inputPromptActive: boolean;
  maxEvents: number;
}

export type PlaybackAction =
  | { type: 'RUN_START'; code: string; mode: 'normal' | 'slow' }
  | { type: 'REPLAY_LOAD'; code: string; events: TraceEvent[]; error?: string }
  | { type: 'STATUS_CHANGE'; status: string }
  | { type: 'EVENT_APPEND'; event: TraceEvent }
  | { type: 'RUN_DONE'; error?: string }
  | { type: 'PLAYBACK_TICK' }
  | { type: 'STEP_NEXT' }
  | { type: 'STEP_PREV' }
  | { type: 'SEEK_INDEX'; index: number }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'STOP' }
  | { type: 'RESET'; code: string }
  | { type: 'SET_SPEED'; speed: number }
  | { type: 'SET_MODE'; mode: 'normal' | 'slow' }
  | { type: 'UPDATE_CODE'; code: string }
  | { type: 'INPUT_REQUEST' }
  | { type: 'INPUT_SUBMIT' };

export const INITIAL_PLAYBACK_STATE: PlaybackState = {
  status: 'idle',
  executionStatus: 'idle',
  isExecutionDone: false,
  isPlaying: false,
  mode: 'slow',
  speed: 1,
  events: [],
  currentIndex: -1,
  sourceSnapshot: '',
  currentCode: '',
  activeLine: 0,
  currentEvent: null,
  activeLocals: {},
  activeStack: [],
  errorMessage: null,
  inputPromptActive: false,
  maxEvents: 3000,
};

function computeDerivedForIndex(
  events: TraceEvent[],
  targetIndex: number,
  state: PlaybackState
): {
  activeLine: number;
  activeLocals: Record<string, Value>;
  activeStack: string[];
} {
  if (targetIndex < 0 || targetIndex >= events.length) {
    return {
      activeLine: 0,
      activeLocals: {},
      activeStack: [],
    };
  }

  const codeModified = state.currentCode !== state.sourceSnapshot;

  let locals: Record<string, Value> = {};
  let stack: string[] = [];
  let line = 0;

  for (let i = 0; i <= targetIndex; i++) {
    const ev = events[i];
    if (!ev) continue;
    if (ev.locals) {
      locals = { ...locals, ...ev.locals };
    }
    if (ev.stack) {
      stack = [...ev.stack];
    }
    if (ev.line !== undefined && ev.line > 0) {
      line = ev.line;
    }
  }

  const targetEv = events[targetIndex];
  const activeLine = codeModified ? 0 : (targetEv?.line && targetEv.line > 0 ? targetEv.line : line);

  return {
    activeLine,
    activeLocals: locals,
    activeStack: stack,
  };
}

export function playbackReducer(state: PlaybackState, action: PlaybackAction): PlaybackState {
  switch (action.type) {
    case 'REPLAY_LOAD': {
      const events = structuredClone(action.events.slice(0, state.maxEvents));
      const base: PlaybackState = {
        ...INITIAL_PLAYBACK_STATE, speed: state.speed, mode: 'slow',
        currentCode: state.currentCode, sourceSnapshot: action.code,
        events, currentIndex: events.length ? 0 : -1,
        currentEvent: events[0] ?? null, isExecutionDone: true,
        executionStatus: action.error ? 'error' : 'done',
        status: events.length ? 'paused' : 'done', isPlaying: false,
        errorMessage: action.error ?? null,
      };
      return { ...base, ...computeDerivedForIndex(events, base.currentIndex, base) };
    }
    case 'RUN_START': {
      return {
        ...state,
        status: 'running',
        executionStatus: 'running',
        isExecutionDone: false,
        isPlaying: true,
        mode: action.mode,
        events: [],
        currentIndex: -1,
        sourceSnapshot: action.code,
        currentCode: action.code,
        activeLine: 0,
        currentEvent: null,
        activeLocals: {},
        activeStack: [],
        errorMessage: null,
        inputPromptActive: false,
      };
    }

    case 'RESET': {
      return {
        ...state,
        status: 'idle',
        executionStatus: 'idle',
        isExecutionDone: false,
        isPlaying: false,
        events: [],
        currentIndex: -1,
        sourceSnapshot: action.code,
        currentCode: action.code,
        activeLine: 0,
        currentEvent: null,
        activeLocals: {},
        activeStack: [],
        errorMessage: null,
        inputPromptActive: false,
      };
    }

    case 'STATUS_CHANGE': {
      let mappedExecStatus = state.executionStatus;
      const s = action.status.toLowerCase();

      if (s === 'initializing' || s.includes('กำลังโหลด') || s.includes('init')) {
        mappedExecStatus = 'initializing';
      } else if (s === 'ready' || s.includes('พร้อม')) {
        mappedExecStatus = 'idle';
      } else if (s === 'running' || s.includes('กำลังรัน')) {
        mappedExecStatus = 'running';
      } else if (s === 'paused') {
        mappedExecStatus = 'paused';
      } else if (s === 'waiting_input' || s.includes('input')) {
        mappedExecStatus = 'waiting_input';
      } else if (s === 'done') {
        mappedExecStatus = 'done';
      } else if (s === 'error') {
        mappedExecStatus = 'error';
      }

      let newStatus = state.status;
      if (mappedExecStatus === 'initializing' && state.status !== 'error') {
        newStatus = 'initializing';
      } else if (mappedExecStatus === 'waiting_input') {
        newStatus = 'waiting_input';
      } else if (state.isPlaying) {
        newStatus = 'running';
      }

      return {
        ...state,
        executionStatus: mappedExecStatus,
        status: newStatus,
        inputPromptActive: mappedExecStatus === 'waiting_input' ? true : state.inputPromptActive,
      };
    }

    case 'EVENT_APPEND': {
      if (state.events.length >= state.maxEvents) {
        return state;
      }
      const newEvents = [...state.events, action.event];

      // In normal mode: jump to end immediately
      if (state.mode === 'normal') {
        const newIndex = newEvents.length - 1;
        const currentEvt = newEvents[newIndex] ?? null;
        const derived = computeDerivedForIndex(newEvents, newIndex, state);

        return {
          ...state,
          events: newEvents,
          currentIndex: newIndex,
          currentEvent: currentEvt,
          activeLine: derived.activeLine,
          activeLocals: derived.activeLocals,
          activeStack: derived.activeStack,
        };
      }

      // In slow mode: buffer events without jumping to end
      // If we had no events yet (-1), point to the first event (0)
      if (state.currentIndex === -1) {
        const currentEvt = newEvents[0] ?? null;
        const derived = computeDerivedForIndex(newEvents, 0, state);

        return {
          ...state,
          events: newEvents,
          currentIndex: 0,
          currentEvent: currentEvt,
          activeLine: derived.activeLine,
          activeLocals: derived.activeLocals,
          activeStack: derived.activeStack,
        };
      }

      // Otherwise retain current position in buffered replay
      return {
        ...state,
        events: newEvents,
      };
    }

    case 'RUN_DONE': {
      const isErr = !!action.error;

      if (isErr) {
        return {
          ...state,
          executionStatus: 'error',
          isExecutionDone: true,
          isPlaying: false,
          status: 'error',
          errorMessage: action.error || null,
          inputPromptActive: false,
        };
      }

      if (state.mode === 'normal' || state.currentIndex >= state.events.length - 1) {
        return {
          ...state,
          executionStatus: 'done',
          isExecutionDone: true,
          isPlaying: false,
          status: 'done',
          errorMessage: null,
          inputPromptActive: false,
        };
      }

      // In slow mode and playback has not caught up to the end yet:
      // Execution is complete, but playback remains running
      return {
        ...state,
        executionStatus: 'done',
        isExecutionDone: true,
        errorMessage: null,
        inputPromptActive: false,
      };
    }

    case 'PLAYBACK_TICK':
    case 'STEP_NEXT': {
      if (state.currentIndex < state.events.length - 1) {
        const nextIndex = state.currentIndex + 1;
        const evt = state.events[nextIndex] ?? null;
        const derived = computeDerivedForIndex(state.events, nextIndex, state);

        const isAtEnd = nextIndex >= state.events.length - 1;
        const nowDone = isAtEnd && state.isExecutionDone && state.isPlaying;

        return {
          ...state,
          currentIndex: nextIndex,
          currentEvent: evt,
          activeLine: derived.activeLine,
          activeLocals: derived.activeLocals,
          activeStack: derived.activeStack,
          status: nowDone ? (state.executionStatus === 'error' ? 'error' : 'done') : state.status,
          isPlaying: nowDone ? false : state.isPlaying,
        };
      } else if (state.isExecutionDone && state.status === 'running') {
        return {
          ...state,
          status: state.executionStatus === 'error' ? 'error' : 'done',
          isPlaying: false,
        };
      }
      return state;
    }

    case 'STEP_PREV': {
      if (state.currentIndex > 0) {
        const prevIndex = state.currentIndex - 1;
        const evt = state.events[prevIndex] ?? null;
        const derived = computeDerivedForIndex(state.events, prevIndex, state);
        return {
          ...state,
          currentIndex: prevIndex,
          currentEvent: evt,
          activeLine: derived.activeLine,
          activeLocals: derived.activeLocals,
          activeStack: derived.activeStack,
        };
      }
      return state;
    }

    case 'SEEK_INDEX': {
      if (state.events.length === 0) return state;
      const targetIndex = Math.max(0, Math.min(action.index, state.events.length - 1));
      const evt = state.events[targetIndex] ?? null;
      const derived = computeDerivedForIndex(state.events, targetIndex, state);
      return {
        ...state,
        currentIndex: targetIndex,
        currentEvent: evt,
        activeLine: derived.activeLine,
        activeLocals: derived.activeLocals,
        activeStack: derived.activeStack,
      };
    }

    case 'PAUSE': {
      return {
        ...state,
        status: 'paused',
        isPlaying: false,
      };
    }

    case 'RESUME': {
      if (state.events.length === 0) {
        return {
          ...state,
          status: 'running',
          isPlaying: true,
        };
      }
      const restartFromBeginning = state.currentIndex >= state.events.length - 1;
      const targetIndex = restartFromBeginning ? 0 : state.currentIndex;
      const evt = state.events[targetIndex] ?? null;
      const derived = computeDerivedForIndex(state.events, targetIndex, state);

      return {
        ...state,
        status: 'running',
        isPlaying: true,
        currentIndex: targetIndex,
        currentEvent: evt,
        activeLine: derived.activeLine,
        activeLocals: derived.activeLocals,
        activeStack: derived.activeStack,
      };
    }

    case 'STOP': {
      return {
        ...state,
        status: 'stopped',
        executionStatus: 'stopped',
        isPlaying: false,
        inputPromptActive: false,
      };
    }

    case 'SET_SPEED': {
      return {
        ...state,
        speed: action.speed,
      };
    }

    case 'SET_MODE': {
      return {
        ...state,
        mode: action.mode,
      };
    }

    case 'UPDATE_CODE': {
      const isModified = action.code !== state.sourceSnapshot;
      return {
        ...state,
        currentCode: action.code,
        activeLine: isModified ? 0 : state.activeLine,
      };
    }

    case 'INPUT_REQUEST': {
      return {
        ...state,
        status: 'waiting_input',
        executionStatus: 'waiting_input',
        inputPromptActive: true,
      };
    }

    case 'INPUT_SUBMIT': {
      // Resume: the run is no longer blocked on input(), so leave the waiting_input state
      return {
        ...state,
        status: state.status === 'waiting_input' ? 'running' : state.status,
        executionStatus: state.executionStatus === 'waiting_input' ? 'running' : state.executionStatus,
        inputPromptActive: false,
      };
    }

    default:
      return state;
  }
}
