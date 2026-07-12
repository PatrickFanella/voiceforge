import { useCallback, useEffect, useReducer } from 'react';
import { Platform } from 'react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';

import { INITIAL_RECORDER_STATE, voiceRecorderReducer } from './recorder-state';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Audio recording failed';
}

function retainRecording(uri: string): string {
  if (Platform.OS === 'web') return uri;

  const directory = new Directory(Paths.document, 'voice-recordings');
  directory.create({ idempotent: true, intermediates: true });
  const source = new File(uri);
  const extension = source.extension || '.m4a';
  const destination = new File(directory, `voice-${Date.now()}${extension}`);
  source.copy(destination);
  return destination.uri;
}

export function useVoiceRecorder() {
  const [state, dispatch] = useReducer(voiceRecorderReducer, INITIAL_RECORDER_STATE);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);

  const start = useCallback(async () => {
    if (state.phase === 'recording' || state.phase === 'stopping') return;
    dispatch({ type: 'REQUEST_PERMISSION' });
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        dispatch({ type: 'FAIL', message: 'Microphone permission is required to record a voice note.' });
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      dispatch({ type: 'START' });
    } catch (error) {
      dispatch({ type: 'FAIL', message: errorMessage(error) });
    }
  }, [recorder, state.phase]);

  const stop = useCallback(async () => {
    if (state.phase !== 'recording') return;
    dispatch({ type: 'STOP' });
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('The recorder did not produce an audio file.');
      dispatch({ type: 'READY_FOR_REVIEW', audioUri: retainRecording(uri) });
    } catch (error) {
      dispatch({ type: 'FAIL', message: errorMessage(error) });
    }
  }, [recorder, state.phase]);

  const cancel = useCallback(async () => {
    try {
      if (recorder.isRecording) await recorder.stop();
      if (Platform.OS !== 'web') {
        for (const uri of [state.audioUri, recorder.uri]) {
          if (!uri) continue;
          const file = new File(uri);
          if (file.exists) file.delete();
        }
      }
    } finally {
      dispatch({ type: 'CANCEL' });
    }
  }, [recorder, state.audioUri]);

  useEffect(() => {
    if (state.phase === 'recording' && recorderState.mediaServicesDidReset) {
      dispatch({ type: 'FAIL', message: 'Recording was interrupted by the device audio system.' });
    }
  }, [recorderState.mediaServicesDidReset, state.phase]);

  return {
    state,
    durationMillis: recorderState.durationMillis,
    start,
    stop,
    cancel,
    reset: () => dispatch({ type: 'RESET' }),
  };
}
