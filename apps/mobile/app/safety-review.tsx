import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { v7 as uuidv7 } from 'uuid';

import { Colors } from '@/constants/colors';
import { getLocalDateKey } from '@/domain/time';
import { useApp } from '@/providers/AppProvider';
import type { SafetyReport } from '@/types';

export default function SafetyReviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { voiceLogId, transcript, jobId } = useLocalSearchParams<{ voiceLogId: string; transcript: string; jobId: string }>();
  const app = useApp();
  const job = app.jobs.find((candidate) => candidate.id === jobId);
  const [type, setType] = useState<SafetyReport['type']>('hazard');
  const [severity, setSeverity] = useState<SafetyReport['severity']>('medium');
  const [description, setDescription] = useState(transcript ?? '');
  const [resolved, setResolved] = useState(false);
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    if (!job || !voiceLogId || !description.trim()) {
      Alert.alert('Review required', 'A job, source voice log, and description are required.');
      return;
    }
    const report: SafetyReport = {
      id: uuidv7(), jobId: job.id, jobTitle: job.title, date: getLocalDateKey(),
      type, severity, description: description.trim(), resolved, voiceLogged: true, sourceVoiceLogId: voiceLogId,
    };
    setSaving(true);
    try {
      await app.addSafetyReport(report, true);
      router.replace('/(tabs)/reports');
    } catch (error) {
      Alert.alert('Could not save safety report', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>EXPLICIT CONFIRMATION</Text><Text style={styles.title}>Review safety report</Text>
      <Text style={styles.body}>This creates a consequential safety record linked to the original voice log. Verify every field.</Text>
      <Text style={styles.job}>{job?.title ?? 'Missing job'}</Text>
      <Text style={styles.label}>Description</Text><TextInput accessibilityLabel="Safety report description" multiline value={description} onChangeText={setDescription} style={styles.input} />
      <Text style={styles.label}>Type</Text><Options values={['incident', 'hazard', 'inspection', 'compliance']} selected={type} onSelect={(value) => setType(value as SafetyReport['type'])} />
      <Text style={styles.label}>Severity</Text><Options values={['low', 'medium', 'high', 'critical']} selected={severity} onSelect={(value) => setSeverity(value as SafetyReport['severity'])} />
      <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: resolved }} accessibilityLabel="Mark safety report resolved" style={[styles.check, resolved && styles.checkActive]} onPress={() => setResolved((value) => !value)}><Text style={styles.checkText}>{resolved ? '✓ Resolved' : 'Not resolved'}</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Confirm and create safety report" disabled={saving} style={styles.primary} onPress={() => void confirm()}><Text style={styles.primaryText}>{saving ? 'Saving…' : 'Confirm safety report'}</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Skip safety report" style={styles.cancel} onPress={() => router.replace('/(tabs)/voice-logs')}><Text style={styles.cancelText}>Keep voice log only</Text></TouchableOpacity>
    </ScrollView>
  );
}

function Options({ values, selected, onSelect }: { values: string[]; selected: string; onSelect: (value: string) => void }) {
  return <View style={styles.options}>{values.map((value) => <TouchableOpacity key={value} accessibilityRole="button" accessibilityLabel={`Set to ${value}`} style={[styles.option, selected === value && styles.optionActive]} onPress={() => onSelect(value)}><Text style={[styles.optionText, selected === value && styles.optionTextActive]}>{value}</Text></TouchableOpacity>)}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background }, content: { padding: 20, paddingBottom: 50 }, eyebrow: { color: Colors.dark.warning, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginTop: 16 },
  title: { color: Colors.dark.text, fontSize: 27, fontWeight: '700', marginTop: 8 }, body: { color: Colors.dark.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 8 }, job: { color: Colors.dark.accent, fontSize: 13, fontWeight: '700', marginTop: 16 },
  label: { color: Colors.dark.text, fontSize: 13, fontWeight: '700', marginTop: 20, marginBottom: 8 }, input: { minHeight: 120, backgroundColor: Colors.dark.surface, borderColor: Colors.dark.border, borderWidth: 1, borderRadius: 13, color: Colors.dark.text, padding: 13, textAlignVertical: 'top' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, option: { borderColor: Colors.dark.border, borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 }, optionActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim }, optionText: { color: Colors.dark.textMuted, fontSize: 12, textTransform: 'capitalize' }, optionTextActive: { color: Colors.dark.accent, fontWeight: '700' },
  check: { borderColor: Colors.dark.border, borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 22 }, checkActive: { borderColor: Colors.dark.success, backgroundColor: Colors.dark.successDim }, checkText: { color: Colors.dark.textSecondary, fontWeight: '700' },
  primary: { backgroundColor: Colors.dark.accent, minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 18 }, primaryText: { color: '#fff', fontWeight: '700' }, cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' }, cancelText: { color: Colors.dark.textSecondary, fontWeight: '600' },
});
