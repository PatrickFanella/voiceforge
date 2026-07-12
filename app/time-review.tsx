import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/colors';
import { buildTimeEntryFromClock } from '@/domain/clock';
import { useApp } from '@/providers/AppProvider';
import type { TimeEntry } from '@/types';

function toLocalInput(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function TimeReviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { voiceLogId, transcript, jobId } = useLocalSearchParams<{ voiceLogId: string; transcript: string; jobId: string }>();
  const app = useApp();
  const job = app.jobs.find((candidate) => candidate.id === jobId);
  const defaults = useMemo(() => ({ end: new Date(), start: new Date(Date.now() - 60 * 60 * 1000) }), []);
  const [startedAt, setStartedAt] = useState(toLocalInput(defaults.start));
  const [endedAt, setEndedAt] = useState(toLocalInput(defaults.end));
  const [type, setType] = useState<TimeEntry['type']>('regular');
  const [notes, setNotes] = useState(transcript ?? '');
  const [saving, setSaving] = useState(false);

  const preview = useMemo(() => {
    if (!job) return null;
    try {
      return buildTimeEntryFromClock({ id: 'preview', job, startedAt: new Date(startedAt).toISOString(), endedAt: new Date(endedAt).toISOString(), type, notes, sourceVoiceLogId: voiceLogId });
    } catch { return null; }
  }, [endedAt, job, notes, startedAt, type, voiceLogId]);

  const confirm = async () => {
    if (!job || !voiceLogId) return Alert.alert('Review required', 'A job and source voice log are required.');
    try {
      const entry = buildTimeEntryFromClock({ id: `time-${Date.now()}`, job, startedAt: new Date(startedAt).toISOString(), endedAt: new Date(endedAt).toISOString(), type, notes, sourceVoiceLogId: voiceLogId });
      setSaving(true);
      await app.addTimeEntry(entry, true);
      router.replace('/(tabs)/reports');
    } catch (error) {
      Alert.alert('Review the time entry', error instanceof Error ? error.message : 'The entry could not be saved.');
    } finally { setSaving(false); }
  };

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>EXPLICIT CONFIRMATION</Text><Text style={styles.title}>Review time entry</Text>
      <Text style={styles.body}>The transcript suggested a time record. Correct the timestamps and type before creating it.</Text><Text style={styles.job}>{job?.title ?? 'Missing job'}</Text>
      <Text style={styles.label}>Started (local)</Text><TextInput accessibilityLabel="Time entry start date and time" value={startedAt} onChangeText={setStartedAt} style={styles.input} />
      <Text style={styles.label}>Ended (local)</Text><TextInput accessibilityLabel="Time entry end date and time" value={endedAt} onChangeText={setEndedAt} style={styles.input} />
      <Text style={styles.hint}>Format: YYYY-MM-DDTHH:MM</Text>
      <Text style={styles.label}>Type</Text><View style={styles.options}>{(['regular', 'overtime', 'travel'] as const).map((value) => <TouchableOpacity key={value} accessibilityRole="button" accessibilityLabel={`Set time type to ${value}`} style={[styles.option, type === value && styles.optionActive]} onPress={() => setType(value)}><Text style={[styles.optionText, type === value && styles.optionTextActive]}>{value}</Text></TouchableOpacity>)}</View>
      <Text style={styles.label}>Notes</Text><TextInput accessibilityLabel="Time entry notes" multiline value={notes} onChangeText={setNotes} style={[styles.input, styles.notes]} />
      <View style={styles.preview}><Text style={styles.previewLabel}>Reviewed total</Text><Text style={styles.previewValue}>{preview ? `${preview.hours.toFixed(2)} hours` : 'Check timestamps'}</Text></View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Confirm and create time entry" disabled={saving || !preview} style={styles.primary} onPress={() => void confirm()}><Text style={styles.primaryText}>{saving ? 'Saving…' : 'Confirm time entry'}</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Skip time entry" style={styles.cancel} onPress={() => router.replace('/(tabs)/voice-logs')}><Text style={styles.cancelText}>Keep voice log only</Text></TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background }, content: { padding: 20, paddingBottom: 50 }, eyebrow: { color: Colors.dark.warning, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginTop: 16 }, title: { color: Colors.dark.text, fontSize: 27, fontWeight: '700', marginTop: 8 }, body: { color: Colors.dark.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 8 }, job: { color: Colors.dark.accent, fontWeight: '700', marginTop: 16 },
  label: { color: Colors.dark.text, fontSize: 13, fontWeight: '700', marginTop: 18, marginBottom: 8 }, input: { minHeight: 48, backgroundColor: Colors.dark.surface, borderColor: Colors.dark.border, borderWidth: 1, borderRadius: 12, color: Colors.dark.text, paddingHorizontal: 13 }, hint: { color: Colors.dark.textMuted, fontSize: 11, marginTop: 7 }, notes: { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' },
  options: { flexDirection: 'row', gap: 8 }, option: { flex: 1, borderColor: Colors.dark.border, borderWidth: 1, borderRadius: 10, padding: 11, alignItems: 'center' }, optionActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim }, optionText: { color: Colors.dark.textMuted, textTransform: 'capitalize', fontSize: 12 }, optionTextActive: { color: Colors.dark.accent, fontWeight: '700' },
  preview: { backgroundColor: Colors.dark.surface, borderRadius: 13, padding: 15, marginTop: 22, flexDirection: 'row', justifyContent: 'space-between' }, previewLabel: { color: Colors.dark.textSecondary }, previewValue: { color: Colors.dark.accent, fontWeight: '800' },
  primary: { backgroundColor: Colors.dark.accent, minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 16 }, primaryText: { color: '#fff', fontWeight: '700' }, cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' }, cancelText: { color: Colors.dark.textSecondary, fontWeight: '600' },
});
