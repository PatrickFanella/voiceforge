export type RecorderPhase = 'idle' | 'requesting-permission' | 'recording' | 'stopping' | 'review' | 'error';

export interface VoiceRecorderState {
  phase: RecorderPhase;
  audioUri: string | null;
  error: string | null;
}

export type VoiceRecorderEvent =
  | { type: 'REQUEST_PERMISSION' }
  | { type: 'START' }
  | { type: 'STOP' }
  | { type: 'READY_FOR_REVIEW'; audioUri: string }
  | { type: 'FAIL'; message: string }
  | { type: 'CANCEL' }
  | { type: 'RESET' };

export const INITIAL_RECORDER_STATE: VoiceRecorderState = { phase: 'idle', audioUri: null, error: null };

export function voiceRecorderReducer(state: VoiceRecorderState, event: VoiceRecorderEvent): VoiceRecorderState {
  switch (event.type) {
    case 'REQUEST_PERMISSION':
      if (state.phase === 'recording' || state.phase === 'stopping') return state;
      return { phase: 'requesting-permission', audioUri: null, error: null };
    case 'START':
      if (state.phase !== 'requesting-permission' && state.phase !== 'idle') return state;
      return { phase: 'recording', audioUri: null, error: null };
    case 'STOP':
      if (state.phase !== 'recording') return state;
      return { ...state, phase: 'stopping' };
    case 'READY_FOR_REVIEW':
      if (state.phase !== 'stopping') return state;
      return { phase: 'review', audioUri: event.audioUri, error: null };
    case 'FAIL':
      return { phase: 'error', audioUri: null, error: event.message };
    case 'CANCEL':
    case 'RESET':
      return INITIAL_RECORDER_STATE;
  }
}
