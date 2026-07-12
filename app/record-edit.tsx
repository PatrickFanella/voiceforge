import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/colors';
import { useApp } from '@/providers/AppProvider';
import type { SafetyReport, TimeEntry } from '@/types';

export default function RecordEditScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { entityType, id } = useLocalSearchParams<{ entityType: 'time_entry' | 'safety_report'; id: string }>();
  const app = useApp();
  const timeEntry = entityType === 'time_entry' ? app.timeEntries.find((entry) => entry.id === id) : undefined;
  const safetyReport = entityType === 'safety_report' ? app.safetyReports.find((report) => report.id === id) : undefined;
  const [startTime, setStartTime] = useState(timeEntry?.startTime ?? '');
  const [endTime, setEndTime] = useState(timeEntry?.endTime ?? '');
  const [timeType, setTimeType] = useState<TimeEntry['type']>(timeEntry?.type ?? 'regular');
  const [notes, setNotes] = useState(timeEntry?.notes ?? '');
  const [severity, setSeverity] = useState<SafetyReport['severity']>(safetyReport?.severity ?? 'low');
  const [description, setDescription] = useState(safetyReport?.description ?? '');
  const [resolved, setResolved] = useState(safetyReport?.resolved ?? false);

  const save = async () => {
    try {
      if (timeEntry) {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) throw new Error('Use HH:MM for start and end times');
        const [startHour, startMinute] = startTime.split(':').map(Number);
        const [endHour, endMinute] = endTime.split(':').map(Number);
        let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
        if (minutes <= 0) minutes += 24 * 60;
        await app.updateTimeEntry({ ...timeEntry, startTime, endTime, type: timeType, notes: notes.trim(), hours: Math.round(minutes / 60 * 100) / 100 });
      } else if (safetyReport) {
        if (!description.trim()) throw new Error('Description is required');
        await app.updateSafetyReport({ ...safetyReport, severity, description: description.trim(), resolved });
      } else {
        throw new Error('Record not found');
      }
      router.back();
    } catch (error) {
      Alert.alert('Could not update record', error instanceof Error ? error.message : 'Try again.');
    }
  };

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>AUDITED EDIT</Text><Text style={styles.title}>Edit {timeEntry ? 'time entry' : 'safety report'}</Text>
      {timeEntry ? <>
        <Text style={styles.label}>Start time</Text><TextInput accessibilityLabel="Edit start time" value={startTime} onChangeText={setStartTime} style={styles.input} />
        <Text style={styles.label}>End time</Text><TextInput accessibilityLabel="Edit end time" value={endTime} onChangeText={setEndTime} style={styles.input} />
        <Text style={styles.label}>Type</Text><Options values={['regular', 'overtime', 'travel']} selected={timeType} onSelect={(value) => setTimeType(value as TimeEntry['type'])} />
        <Text style={styles.label}>Notes</Text><TextInput accessibilityLabel="Edit time entry notes" multiline value={notes} onChangeText={setNotes} style={[styles.input, styles.multiline]} />
      </> : null}
      {safetyReport ? <>
        <Text style={styles.label}>Severity</Text><Options values={['low', 'medium', 'high', 'critical']} selected={severity} onSelect={(value) => setSeverity(value as SafetyReport['severity'])} />
        <Text style={styles.label}>Description</Text><TextInput accessibilityLabel="Edit safety report description" multiline value={description} onChangeText={setDescription} style={[styles.input, styles.multiline]} />
        <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: resolved }} accessibilityLabel="Toggle safety report resolved" style={styles.check} onPress={() => setResolved((value) => !value)}><Text style={styles.checkText}>{resolved ? '✓ Resolved' : 'Not resolved'}</Text></TouchableOpacity>
      </> : null}
      <Text style={styles.auditNote}>This update will be recorded in the local audit history.</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Save record changes" style={styles.primary} onPress={() => void save()}><Text style={styles.primaryText}>Save changes</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancel editing" style={styles.cancel} onPress={() => router.back()}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
    </ScrollView>
  );
}

function Options({ values, selected, onSelect }: { values: string[]; selected: string; onSelect: (value: string) => void }) {
  return <View style={styles.options}>{values.map((value) => <TouchableOpacity key={value} accessibilityRole="button" accessibilityLabel={`Set to ${value}`} style={[styles.option, selected === value && styles.optionActive]} onPress={() => onSelect(value)}><Text style={[styles.optionText, selected === value && styles.optionTextActive]}>{value}</Text></TouchableOpacity>)}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background }, content: { padding: 20, paddingBottom: 50 }, eyebrow: { color: Colors.dark.warning, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginTop: 16 }, title: { color: Colors.dark.text, fontSize: 27, fontWeight: '700', marginTop: 8 },
  label: { color: Colors.dark.text, fontSize: 13, fontWeight: '700', marginTop: 20, marginBottom: 8 }, input: { minHeight: 48, backgroundColor: Colors.dark.surface, borderColor: Colors.dark.border, borderWidth: 1, borderRadius: 12, color: Colors.dark.text, paddingHorizontal: 13 }, multiline: { minHeight: 100, paddingTop: 12, textAlignVertical: 'top' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, option: { borderColor: Colors.dark.border, borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 }, optionActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim }, optionText: { color: Colors.dark.textMuted, textTransform: 'capitalize', fontSize: 12 }, optionTextActive: { color: Colors.dark.accent, fontWeight: '700' },
  check: { borderColor: Colors.dark.border, borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 22 }, checkText: { color: Colors.dark.textSecondary, fontWeight: '700' }, auditNote: { color: Colors.dark.textMuted, fontSize: 11, marginTop: 24 },
  primary: { backgroundColor: Colors.dark.accent, minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 14 }, primaryText: { color: '#fff', fontWeight: '700' }, cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' }, cancelText: { color: Colors.dark.textSecondary, fontWeight: '600' },
});
