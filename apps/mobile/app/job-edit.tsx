import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/colors';
import { useApp } from '@/providers/AppProvider';
import type { Job } from '@/types';

export default function JobEditScreen() {
  const insets = useSafeAreaInsets(); const router = useRouter(); const { id } = useLocalSearchParams<{ id: string }>(); const app = useApp();
  const job = app.jobs.find((candidate) => candidate.id === id);
  const [title, setTitle] = useState(job?.title ?? ''); const [client, setClient] = useState(job?.client ?? ''); const [address, setAddress] = useState(job?.address ?? '');
  const [status, setStatus] = useState<Job['status']>(job?.status ?? 'pending'); const [priority, setPriority] = useState<Job['priority']>(job?.priority ?? 'medium');
  const [dueDate, setDueDate] = useState(job?.dueDate ?? '');

  const save = async () => {
    if (!job || !title.trim() || !client.trim()) return Alert.alert('Review required', 'Job title and client are required.');
    try { await app.updateJob({ ...job, title: title.trim(), client: client.trim(), address: address.trim(), status, priority, dueDate }); router.back(); }
    catch (error) { Alert.alert('Could not update job', error instanceof Error ? error.message : 'Try again.'); }
  };

  return <ScrollView style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.eyebrow}>AUDITED EDIT</Text><Text style={styles.title}>Edit job</Text>
    <Field label="Title" value={title} setValue={setTitle} /><Field label="Client" value={client} setValue={setClient} /><Field label="Address" value={address} setValue={setAddress} /><Field label="Due date" value={dueDate} setValue={setDueDate} />
    <Text style={styles.label}>Status</Text><Options values={['active', 'pending', 'completed', 'paused']} selected={status} onSelect={(value) => setStatus(value as Job['status'])} />
    <Text style={styles.label}>Priority</Text><Options values={['low', 'medium', 'high', 'urgent']} selected={priority} onSelect={(value) => setPriority(value as Job['priority'])} />
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Save job changes" style={styles.primary} onPress={() => void save()}><Text style={styles.primaryText}>Save changes</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancel job editing" style={styles.cancel} onPress={() => router.back()}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
  </ScrollView>;
}

function Field({ label, value, setValue }: { label: string; value: string; setValue: (value: string) => void }) { return <><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={`Job ${label.toLowerCase()}`} value={value} onChangeText={setValue} style={styles.input} /></>; }
function Options({ values, selected, onSelect }: { values: string[]; selected: string; onSelect: (value: string) => void }) { return <View style={styles.options}>{values.map((value) => <TouchableOpacity key={value} accessibilityRole="button" accessibilityLabel={`Set to ${value}`} style={[styles.option, selected === value && styles.optionActive]} onPress={() => onSelect(value)}><Text style={[styles.optionText, selected === value && styles.optionTextActive]}>{value}</Text></TouchableOpacity>)}</View>; }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background }, content: { padding: 20, paddingBottom: 50 }, eyebrow: { color: Colors.dark.warning, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginTop: 16 }, title: { color: Colors.dark.text, fontSize: 27, fontWeight: '700', marginTop: 8 },
  label: { color: Colors.dark.text, fontSize: 13, fontWeight: '700', marginTop: 18, marginBottom: 8 }, input: { minHeight: 48, backgroundColor: Colors.dark.surface, borderColor: Colors.dark.border, borderWidth: 1, borderRadius: 12, color: Colors.dark.text, paddingHorizontal: 13 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, option: { borderColor: Colors.dark.border, borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 }, optionActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim }, optionText: { color: Colors.dark.textMuted, textTransform: 'capitalize', fontSize: 12 }, optionTextActive: { color: Colors.dark.accent, fontWeight: '700' },
  primary: { backgroundColor: Colors.dark.accent, minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 24 }, primaryText: { color: '#fff', fontWeight: '700' }, cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' }, cancelText: { color: Colors.dark.textSecondary, fontWeight: '600' },
});
