import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Mic, MicOff, X, Waves, CheckCircle } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { useApp } from '@/providers/AppProvider';
import * as Haptics from 'expo-haptics';

const SAMPLE_TRANSCRIPTS = [
  "Clocking in at the Henderson job site. Starting EV charger install, running conduit from panel to garage.",
  "Safety check done. All PPE verified. Lockout tagout confirmed on main breaker before starting work.",
  "Need to order 100 feet of 6/3 Romex and a 50-amp GFCI breaker for the charger install tomorrow.",
  "Finished pulling wire through conduit. Taking a break. Will mount the charger unit after lunch.",
];

export default function VoiceScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { addVoiceLog, activeJob } = useApp();

  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);

  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const doneScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeIn, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [fadeIn]);

  useEffect(() => {
    if (!recording) return;

    const createRingAnimation = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(anim, {
              toValue: 1,
              duration: 2000,
              useNativeDriver: true,
            }),
          ]),
          Animated.timing(anim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );

    const a1 = createRingAnimation(ring1, 0);
    const a2 = createRingAnimation(ring2, 600);
    const a3 = createRingAnimation(ring3, 1200);

    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
      ring1.setValue(0);
      ring2.setValue(0);
      ring3.setValue(0);
    };
  }, [recording, ring1, ring2, ring3]);

  const startRecording = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setRecording(true);
    setTranscript('');
    setDone(false);

    const randomTranscript = SAMPLE_TRANSCRIPTS[Math.floor(Math.random() * SAMPLE_TRANSCRIPTS.length)];
    let charIndex = 0;

    const interval = setInterval(() => {
      if (charIndex < randomTranscript.length) {
        setTranscript(randomTranscript.slice(0, charIndex + 1));
        charIndex++;
      }
    }, 35);

    setTimeout(() => {
      clearInterval(interval);
      setTranscript(randomTranscript);
    }, randomTranscript.length * 35 + 100);
  }, []);

  const stopRecording = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRecording(false);
    setProcessing(true);

    setTimeout(() => {
      setProcessing(false);
      setDone(true);

      Animated.spring(doneScale, {
        toValue: 1,
        friction: 5,
        tension: 100,
        useNativeDriver: true,
      }).start();

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const categories: ('time' | 'safety' | 'materials' | 'note')[] = ['time', 'safety', 'materials', 'note'];
      addVoiceLog({
        id: `v-${Date.now()}`,
        timestamp: new Date().toISOString(),
        transcript: transcript || 'Voice log recorded',
        category: categories[Math.floor(Math.random() * categories.length)],
        processed: true,
        jobId: activeJob?.id,
      });
    }, 1500);
  }, [transcript, addVoiceLog, activeJob, doneScale]);

  const handleClose = useCallback(() => {
    Haptics.selectionAsync();
    router.back();
  }, [router]);

  const renderRing = (anim: Animated.Value, size: number) => {
    const scale = anim.interpolate({
      inputRange: [0, 1],
      outputRange: [1, size / 80],
    });
    const opacity = anim.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0.4, 0.15, 0],
    });

    return (
      <Animated.View
        style={[
          styles.ring,
          {
            width: 80,
            height: 80,
            borderRadius: 40,
            transform: [{ scale }],
            opacity,
          },
        ]}
      />
    );
  };

  return (
    <Animated.View style={[styles.container, { paddingTop: insets.top, opacity: fadeIn }]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={handleClose}
          testID="close-voice"
        >
          <X size={22} color={Colors.dark.text} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Voice Capture</Text>
        <View style={{ width: 40 }} />
      </View>

      {activeJob && (
        <View style={styles.jobContext}>
          <View style={styles.jobContextDot} />
          <Text style={styles.jobContextText}>{activeJob.title}</Text>
        </View>
      )}

      <View style={styles.center}>
        {done ? (
          <Animated.View style={[styles.doneContainer, { transform: [{ scale: doneScale }] }]}>
            <View style={styles.doneCircle}>
              <CheckCircle size={48} color={Colors.dark.success} />
            </View>
            <Text style={styles.doneTitle}>Logged</Text>
            <Text style={styles.doneSubtitle}>Processing complete</Text>
          </Animated.View>
        ) : (
          <View style={styles.micArea}>
            {recording && renderRing(ring1, 200)}
            {recording && renderRing(ring2, 260)}
            {recording && renderRing(ring3, 320)}
            <TouchableOpacity
              style={[
                styles.micButton,
                recording && styles.micButtonActive,
                processing && styles.micButtonProcessing,
              ]}
              onPress={recording ? stopRecording : startRecording}
              activeOpacity={0.85}
              disabled={processing}
              testID="mic-button"
            >
              {processing ? (
                <Waves size={36} color="#fff" />
              ) : recording ? (
                <MicOff size={36} color="#fff" />
              ) : (
                <Mic size={36} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.transcriptArea}>
        {transcript ? (
          <View style={styles.transcriptBox}>
            <Text style={styles.transcriptLabel}>
              {processing ? 'Processing with on-device AI...' : recording ? 'Listening...' : 'Transcript'}
            </Text>
            <Text style={styles.transcriptText}>{transcript}</Text>
          </View>
        ) : (
          <View style={styles.hintBox}>
            <Mic size={18} color={Colors.dark.textMuted} />
            <Text style={styles.hintText}>
              {recording ? 'Speak naturally — logging in progress' : 'Tap the mic to start a voice log'}
            </Text>
          </View>
        )}
      </View>

      {done && (
        <TouchableOpacity
          style={styles.newLogBtn}
          onPress={() => {
            setDone(false);
            setTranscript('');
            doneScale.setValue(0);
          }}
        >
          <Text style={styles.newLogText}>New Voice Log</Text>
        </TouchableOpacity>
      )}

      <View style={{ height: insets.bottom + 20 }} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.dark.text,
  },
  jobContext: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  jobContextDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.success,
  },
  jobContextText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    fontWeight: '500' as const,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micArea: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 320,
    height: 320,
  },
  ring: {
    position: 'absolute',
    backgroundColor: Colors.dark.accent,
  },
  micButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.dark.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.dark.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
    zIndex: 10,
  },
  micButtonActive: {
    backgroundColor: Colors.dark.danger,
    shadowColor: Colors.dark.danger,
  },
  micButtonProcessing: {
    backgroundColor: Colors.dark.info,
    shadowColor: Colors.dark.info,
  },
  doneContainer: {
    alignItems: 'center',
    gap: 12,
  },
  doneCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.dark.successDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneTitle: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.dark.text,
  },
  doneSubtitle: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  transcriptArea: {
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  transcriptBox: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  transcriptLabel: {
    fontSize: 11,
    color: Colors.dark.accent,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
    marginBottom: 8,
    textTransform: 'uppercase' as const,
  },
  transcriptText: {
    fontSize: 15,
    color: Colors.dark.text,
    lineHeight: 22,
  },
  hintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
  },
  hintText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
  },
  newLogBtn: {
    marginHorizontal: 24,
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  newLogText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.dark.accent,
  },
});
