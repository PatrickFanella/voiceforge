import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/colors';
import { extractVoiceIntent } from '@/features/voice/extract-intent';
import { createTranscriptionClient } from '@/features/voice/transcription';
import { useApp } from '@/providers/AppProvider';
import type { VoiceLog } from '@/types';

const CATEGORIES: VoiceLog['category'][] = ['time', 'safety', 'materials', 'note', 'communication'];

export default function VoiceReviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { audioUri } = useLocalSearchParams<{ audioUri: string }>();
  const app = useApp();
  const [transcript, setTranscript] = useState('');
  const [category, setCategory] = useState<VoiceLog['category']>('note');
  const [saving, setSaving] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [provider, setProvider] = useState('manual');
  const [transcriptionConfidence, setTranscriptionConfidence] = useState<number | null>(null);
  const [selectedJobId, setSelectedJobId] = useState(app.activeJobId ?? '');
  const intent = useMemo(() => extractVoiceIntent(transcript), [transcript]);

  useEffect(() => {
    const endpoint = process.env.EXPO_PUBLIC_TRANSCRIPTION_API_URL;
    if (!endpoint || !audioUri) return;
    let active = true;
    setTranscribing(true);
    createTranscriptionClient({ endpoint }).transcribe(audioUri).then((result) => {
      if (!active) return;
      const extracted = extractVoiceIntent(result.transcript);
      setTranscript(result.transcript);
      setCategory(extracted.category);
      setProvider(result.provider);
      setTranscriptionConfidence(result.confidence);
    }).catch((error: unknown) => {
      if (active) setTranscriptionError(error instanceof Error ? error.message : 'Automatic transcription failed');
    }).finally(() => {
      if (active) setTranscribing(false);
    });
    return () => {
      active = false;
    };
  }, [audioUri]);

  const save = async () => {
    if (!transcript.trim()) {
      Alert.alert('Transcript required', 'Enter or paste the recording transcript before saving.');
      return;
    }
    setSaving(true);
    try {
      const voiceLogId = `voice-${Date.now()}`;
      await app.addVoiceLog({
        id: voiceLogId,
        timestamp: new Date().toISOString(),
        transcript: transcript.trim(),
        category,
        processed: true,
        jobId: selectedJobId || undefined,
        audioUri,
        confidence: transcriptionConfidence ?? intent.confidence,
        provider,
      });
      if (intent.consequentialAction === 'safety' && selectedJobId) {
        router.replace({ pathname: '/safety-review', params: { voiceLogId, transcript: transcript.trim(), jobId: selectedJobId } } as never);
      } else if (intent.consequentialAction === 'time' && selectedJobId) {
        router.replace({ pathname: '/time-review', params: { voiceLogId, transcript: transcript.trim(), jobId: selectedJobId } } as never);
      } else {
        router.replace('/(tabs)/voice-logs');
      }
    } catch (error) {
      Alert.alert('Could not save voice log', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>REVIEW REQUIRED</Text>
      <Text style={styles.title}>Confirm the field note</Text>
      <Text style={styles.body}>
        {transcribing
          ? 'Transcribing through your configured endpoint…'
          : 'Review every word before saving. When no endpoint is configured, enter the transcript manually.'}
      </Text>
      {transcriptionError ? <Text style={styles.warning}>Automatic transcription unavailable: {transcriptionError}. Manual review is still available.</Text> : null}

      <Text style={styles.label}>Transcript</Text>
      <TextInput
        accessibilityLabel="Voice note transcript"
        multiline
        placeholder="Type what was said…"
        placeholderTextColor={Colors.dark.textMuted}
        style={styles.input}
        value={transcript}
        onChangeText={setTranscript}
      />

      <Text style={styles.label}>Category</Text>
      <View style={styles.categories}>
        {CATEGORIES.map((value) => (
          <TouchableOpacity
            key={value}
            accessibilityRole="button"
            accessibilityLabel={`Set category to ${value}`}
            style={[styles.category, category === value && styles.categoryActive]}
            onPress={() => setCategory(value)}
          >
            <Text style={[styles.categoryText, category === value && styles.categoryTextActive]}>{value}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Target job</Text>
      <View style={styles.jobs}>
        {app.jobs.map((job) => (
          <TouchableOpacity key={job.id} accessibilityRole="button" accessibilityLabel={`Attach to ${job.title}`} style={[styles.jobOption, selectedJobId === job.id && styles.categoryActive]} onPress={() => setSelectedJobId(job.id)}>
            <Text style={[styles.jobOptionText, selectedJobId === job.id && styles.categoryTextActive]} numberOfLines={1}>{job.title}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.context}>Selected: {app.jobs.find((job) => job.id === selectedJobId)?.title ?? 'No job'}</Text>
      <View style={styles.proposal}>
        <Text style={styles.proposalTitle}>Suggested intent · {Math.round(intent.confidence * 100)}% confidence</Text>
        <Text style={styles.proposalBody}>
          {intent.consequentialAction
            ? `Potential ${intent.consequentialAction} record. Saving here creates only the voice log; a separate confirmation is required for the record.`
            : 'No consequential time or safety action will be created.'}
        </Text>
      </View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Save reviewed voice log" disabled={saving} style={styles.save} onPress={() => void save()}>
        <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save reviewed log'}</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancel transcript review" style={styles.cancel} onPress={() => router.back()}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  content: { padding: 20, paddingBottom: 50 },
  eyebrow: { color: Colors.dark.warning, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginTop: 16 },
  title: { color: Colors.dark.text, fontSize: 27, fontWeight: '700', marginTop: 8 },
  body: { color: Colors.dark.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 9 },
  warning: { color: Colors.dark.warning, fontSize: 12, lineHeight: 18, marginTop: 10 },
  label: { color: Colors.dark.text, fontSize: 13, fontWeight: '700', marginTop: 24, marginBottom: 8 },
  input: { minHeight: 150, borderColor: Colors.dark.border, borderWidth: 1, borderRadius: 14, backgroundColor: Colors.dark.surface, color: Colors.dark.text, padding: 14, fontSize: 15, lineHeight: 21, textAlignVertical: 'top' },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  category: { borderColor: Colors.dark.border, borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  categoryActive: { backgroundColor: Colors.dark.accentDim, borderColor: Colors.dark.accent },
  categoryText: { color: Colors.dark.textMuted, fontSize: 12, textTransform: 'capitalize' },
  categoryTextActive: { color: Colors.dark.accent, fontWeight: '700' },
  context: { color: Colors.dark.textMuted, fontSize: 12, marginTop: 24 },
  jobs: { gap: 7 },
  jobOption: { borderColor: Colors.dark.border, borderWidth: 1, borderRadius: 10, padding: 11 },
  jobOptionText: { color: Colors.dark.textSecondary, fontSize: 12 },
  proposal: { backgroundColor: Colors.dark.surface, borderColor: Colors.dark.border, borderWidth: 1, borderRadius: 12, padding: 13, marginTop: 12 },
  proposalTitle: { color: Colors.dark.text, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  proposalBody: { color: Colors.dark.textMuted, fontSize: 11, lineHeight: 17, marginTop: 4 },
  save: { backgroundColor: Colors.dark.accent, borderRadius: 14, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  cancelText: { color: Colors.dark.textSecondary, fontSize: 14, fontWeight: '600' },
});
