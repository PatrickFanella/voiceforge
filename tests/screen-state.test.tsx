import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';

import { ScreenState } from '@/components/ScreenState';

describe('ScreenState', () => {
  it('announces load failures without exposing implementation details', async () => {
    let renderer: ReactTestRenderer;
    await act(async () => { renderer = create(<ScreenState error="VoiceForge could not load local records." />); });
    const root = renderer!.root;
    expect(root.findByProps({ accessibilityRole: 'alert' })).toBeTruthy();
    expect(root.findByProps({ children: 'VoiceForge could not load local records.' })).toBeTruthy();
  });

  it('renders an accessible loading state', async () => {
    let renderer: ReactTestRenderer;
    await act(async () => { renderer = create(<ScreenState loading />); });
    expect(renderer!.root.findByProps({ children: 'Loading VoiceForge…' })).toBeTruthy();
  });
});
