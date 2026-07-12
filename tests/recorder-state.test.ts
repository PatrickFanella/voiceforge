import { describe, expect, it } from 'vitest';

import { INITIAL_RECORDER_STATE, voiceRecorderReducer } from '@/features/voice/recorder-state';

describe('voiceRecorderReducer', () => {
  it('moves through permission, recording, stopping, and review', () => {
    const requesting = voiceRecorderReducer(INITIAL_RECORDER_STATE, { type: 'REQUEST_PERMISSION' });
    const recording = voiceRecorderReducer(requesting, { type: 'START' });
    const stopping = voiceRecorderReducer(recording, { type: 'STOP' });
    expect(voiceRecorderReducer(stopping, { type: 'READY_FOR_REVIEW', audioUri: 'file:///voice.m4a' })).toEqual({
      phase: 'review', audioUri: 'file:///voice.m4a', error: null,
    });
  });

  it('prevents double starts and stops outside recording', () => {
    const recording = { phase: 'recording' as const, audioUri: null, error: null };
    expect(voiceRecorderReducer(recording, { type: 'START' })).toBe(recording);
    expect(voiceRecorderReducer(INITIAL_RECORDER_STATE, { type: 'STOP' })).toBe(INITIAL_RECORDER_STATE);
  });

  it('exposes permission and interruption failures and allows recovery', () => {
    const failed = voiceRecorderReducer(INITIAL_RECORDER_STATE, { type: 'FAIL', message: 'Permission denied' });
    expect(failed).toEqual({ phase: 'error', audioUri: null, error: 'Permission denied' });
    expect(voiceRecorderReducer(failed, { type: 'RESET' })).toEqual(INITIAL_RECORDER_STATE);
  });

  it('cancels any phase back to idle', () => {
    expect(voiceRecorderReducer({ phase: 'review', audioUri: 'file:///x', error: null }, { type: 'CANCEL' })).toEqual(
      INITIAL_RECORDER_STATE,
    );
  });
});
