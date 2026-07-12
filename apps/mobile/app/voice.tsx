import { CheckCircle, Mic, MicOff, RotateCcw, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/colors';
import { useVoiceRecorder } from '@/features/voice/useVoiceRecorder';
import { useApp } from '@/providers/AppProvider';

function formatDuration(durationMillis: number): string {
  const seconds = Math.floor(durationMillis / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function VoiceScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeJob } = useApp();
  const recorder = useVoiceRecorder();
  const { phase } = recorder.state;

  const close = async () => {
    if (phase === 'recording' || phase === 'review') await recorder.cancel();
    router.back();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}> 
      <View style={styles.topBar}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close voice recorder" style={styles.close} onPress={() => void close()}>
          <X color={Colors.dark.text} size={22} />
        </TouchableOpacity>
        <Text style={styles.heading}>Voice capture</Text>
        <View style={styles.close} />
      </View>

      <View style={styles.jobPill}>
        <View style={styles.dot} />
        <Text style={styles.jobText}>{activeJob?.title ?? 'No active job'}</Text>
      </View>

      <View style={styles.center}>
        {phase === 'review' ? (
          <View style={styles.result}>
            <CheckCircle color={Colors.dark.success} size={58} />
            <Text style={styles.resultTitle}>Recording saved</Text>
            <Text style={styles.resultBody}>The audio is retained locally and ready for transcript review.</Text>
          </View>
        ) : (
          <>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={phase === 'recording' ? 'Stop recording' : 'Start recording'}
              disabled={phase === 'requesting-permission' || phase === 'stopping'}
              style={[styles.recordButton, phase === 'recording' && styles.recording]}
              onPress={() => void (phase === 'recording' ? recorder.stop() : recorder.start())}
            >
              {phase === 'requesting-permission' || phase === 'stopping' ? (
                <ActivityIndicator color="#fff" size="large" />
              ) : phase === 'recording' ? (
                <MicOff color="#fff" size={38} />
              ) : (
                <Mic color="#fff" size={38} />
              )}
            </TouchableOpacity>
            <Text style={styles.duration}>{formatDuration(recorder.durationMillis)}</Text>
            <Text style={styles.prompt}>
              {phase === 'recording' ? 'Recording locally — tap to stop' : phase === 'error' ? recorder.state.error : 'Tap the microphone to begin'}
            </Text>
          </>
        )}
      </View>

      {phase === 'error' ? (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Try recording again" style={styles.secondaryButton} onPress={recorder.reset}>
          <RotateCcw color={Colors.dark.accent} size={17} />
          <Text style={styles.secondaryText}>Try again</Text>
        </TouchableOpacity>
      ) : null}

      {phase === 'review' ? (
        <View style={styles.reviewActions}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Discard recording" style={styles.secondaryButton} onPress={() => void recorder.cancel()}>
            <Text style={styles.secondaryText}>Discard</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Continue to transcript review"
            style={styles.primaryButton}
            onPress={() => router.replace({ pathname: '/voice-review', params: { audioUri: recorder.state.audioUri ?? '' } } as never)}
          >
            <Text style={styles.primaryText}>Review transcript</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={{ height: insets.bottom + 18 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  close: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.dark.surface, alignItems: 'center', justifyContent: 'center' },
  heading: { color: Colors.dark.text, fontSize: 17, fontWeight: '700' },
  jobPill: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.dark.surface, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 7 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.dark.success },
  jobText: { color: Colors.dark.textSecondary, fontSize: 12, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  recordButton: { width: 112, height: 112, borderRadius: 56, backgroundColor: Colors.dark.accent, alignItems: 'center', justifyContent: 'center' },
  recording: { backgroundColor: Colors.dark.danger },
  duration: { color: Colors.dark.text, fontSize: 34, fontWeight: '300', fontVariant: ['tabular-nums'], marginTop: 28 },
  prompt: { color: Colors.dark.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 10, maxWidth: 280 },
  result: { alignItems: 'center', maxWidth: 290 },
  resultTitle: { color: Colors.dark.text, fontSize: 24, fontWeight: '700', marginTop: 18 },
  resultBody: { color: Colors.dark.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  reviewActions: { flexDirection: 'row', gap: 10, paddingHorizontal: 20 },
  secondaryButton: { minHeight: 50, flex: 1, borderRadius: 13, borderColor: Colors.dark.border, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, marginHorizontal: 20 },
  secondaryText: { color: Colors.dark.accent, fontSize: 14, fontWeight: '700' },
  primaryButton: { minHeight: 50, flex: 2, borderRadius: 13, backgroundColor: Colors.dark.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
