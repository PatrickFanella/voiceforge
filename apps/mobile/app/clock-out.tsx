import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { v7 as uuidv7 } from 'uuid';

import { Colors } from '@/constants/colors';
import { buildTimeEntryFromClock } from '@/domain/clock';
import { useApp } from '@/providers/AppProvider';
import type { TimeEntry } from '@/types';

function timeValue(timestamp: string): string {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function applyTime(baseTimestamp: string, value: string): Date {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('Use 24-hour time in HH:MM format');
  const [hours, minutes] = value.split(':').map(Number);
  const date = new Date(baseTimestamp);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

export default function ClockOutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const app = useApp();
  const now = useMemo(() => new Date().toISOString(), []);
  const startedAt = app.clockInTime ?? now;
  const job = app.jobs.find((candidate) => candidate.id === app.clockJobId);
  const [startTime, setStartTime] = useState(timeValue(startedAt));
  const [endTime, setEndTime] = useState(timeValue(now));
  const [type, setType] = useState<TimeEntry['type']>('regular');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const preview = useMemo(() => {
    if (!job) return null;
    try {
      const start = applyTime(startedAt, startTime);
      const end = applyTime(now, endTime);
      if (end <= start) end.setDate(end.getDate() + 1);
      return buildTimeEntryFromClock({ id: 'preview', job, startedAt: start.toISOString(), endedAt: end.toISOString(), type, notes });
    } catch {
      return null;
    }
  }, [endTime, job, notes, now, startTime, startedAt, type]);

  const confirm = async () => {
    if (!job) {
      Alert.alert('Clock session is invalid', 'The job attached to this clock session no longer exists.');
      return;
    }
    try {
      const start = applyTime(startedAt, startTime);
      const end = applyTime(now, endTime);
      if (end <= start) end.setDate(end.getDate() + 1);
      const entry = buildTimeEntryFromClock({
        id: uuidv7(), job, startedAt: start.toISOString(), endedAt: end.toISOString(), type, notes,
      });
      setSaving(true);
      await app.completeClockOut(entry);
      router.back();
    } catch (error) {
      Alert.alert('Review the time entry', error instanceof Error ? error.message : 'The entry could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>CONFIRM BEFORE SAVING</Text>
      <Text style={styles.title}>Clock out</Text>
      <Text style={styles.job}>{job?.title ?? 'Missing job'}</Text>

      <View style={styles.timeRow}>
        <View style={styles.field}><Text style={styles.label}>Start</Text><TextInput accessibilityLabel="Start time" value={startTime} onChangeText={setStartTime} style={styles.input} /></View>
        <View style={styles.field}><Text style={styles.label}>End</Text><TextInput accessibilityLabel="End time" value={endTime} onChangeText={setEndTime} style={styles.input} /></View>
      </View>
      <Text style={styles.hint}>24-hour HH:MM. An end before the start is treated as the following day.</Text>

      <Text style={styles.label}>Entry type</Text>
      <View style={styles.options}>
        {(['regular', 'overtime', 'travel'] as const).map((value) => (
          <TouchableOpacity key={value} accessibilityRole="button" accessibilityLabel={`Set time type to ${value}`} style={[styles.option, type === value && styles.optionActive]} onPress={() => setType(value)}>
            <Text style={[styles.optionText, type === value && styles.optionTextActive]}>{value}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.label}>Notes</Text>
      <TextInput accessibilityLabel="Time entry notes" value={notes} onChangeText={setNotes} multiline style={[styles.input, styles.notes]} placeholder="What was completed?" placeholderTextColor={Colors.dark.textMuted} />

      <View style={styles.preview}>
        <Text style={styles.previewLabel}>Reviewed total</Text>
        <Text style={styles.previewValue}>{preview ? `${preview.hours.toFixed(2)} hours` : 'Check the entered times'}</Text>
      </View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Confirm clock out and save time entry" disabled={saving || !preview} style={styles.primary} onPress={() => void confirm()}>
        <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Confirm and clock out'}</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancel clock out" style={styles.cancel} onPress={() => router.back()}><Text style={styles.cancelText}>Keep clock running</Text></TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background }, content: { padding: 20, paddingBottom: 50 },
  eyebrow: { color: Colors.dark.warning, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginTop: 16 },
  title: { color: Colors.dark.text, fontSize: 28, fontWeight: '700', marginTop: 8 }, job: { color: Colors.dark.textSecondary, fontSize: 15, marginTop: 5, marginBottom: 24 },
  timeRow: { flexDirection: 'row', gap: 12 }, field: { flex: 1 }, label: { color: Colors.dark.text, fontSize: 13, fontWeight: '700', marginTop: 18, marginBottom: 8 },
  input: { backgroundColor: Colors.dark.surface, borderColor: Colors.dark.border, borderWidth: 1, borderRadius: 12, minHeight: 48, paddingHorizontal: 13, color: Colors.dark.text, fontSize: 15 },
  notes: { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' }, hint: { color: Colors.dark.textMuted, fontSize: 11, marginTop: 8 },
  options: { flexDirection: 'row', gap: 8 }, option: { flex: 1, borderColor: Colors.dark.border, borderWidth: 1, borderRadius: 10, padding: 11, alignItems: 'center' },
  optionActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim }, optionText: { color: Colors.dark.textMuted, textTransform: 'capitalize', fontSize: 12 }, optionTextActive: { color: Colors.dark.accent, fontWeight: '700' },
  preview: { backgroundColor: Colors.dark.surface, borderRadius: 13, padding: 15, marginTop: 22, flexDirection: 'row', justifyContent: 'space-between' }, previewLabel: { color: Colors.dark.textSecondary }, previewValue: { color: Colors.dark.accent, fontWeight: '800' },
  primary: { backgroundColor: Colors.dark.accent, minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 16 }, primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' }, cancelText: { color: Colors.dark.textSecondary, fontWeight: '600' },
});
