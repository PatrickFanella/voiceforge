import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/colors';
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

  const save = async () => {
    if (!transcript.trim()) {
      Alert.alert('Transcript required', 'Enter or paste the recording transcript before saving.');
      return;
    }
    setSaving(true);
    try {
      await app.addVoiceLog({
        id: `voice-${Date.now()}`,
        timestamp: new Date().toISOString(),
        transcript: transcript.trim(),
        category,
        processed: true,
        jobId: app.activeJobId ?? undefined,
        audioUri,
        provider: 'manual',
      });
      router.replace('/(tabs)/voice-logs');
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
      <Text style={styles.body}>Automatic transcription is not configured, so enter the transcript manually. The audio remains on this device.</Text>

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

      <Text style={styles.context}>Job: {app.activeJob?.title ?? 'No active job'}</Text>
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
  label: { color: Colors.dark.text, fontSize: 13, fontWeight: '700', marginTop: 24, marginBottom: 8 },
  input: { minHeight: 150, borderColor: Colors.dark.border, borderWidth: 1, borderRadius: 14, backgroundColor: Colors.dark.surface, color: Colors.dark.text, padding: 14, fontSize: 15, lineHeight: 21, textAlignVertical: 'top' },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  category: { borderColor: Colors.dark.border, borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  categoryActive: { backgroundColor: Colors.dark.accentDim, borderColor: Colors.dark.accent },
  categoryText: { color: Colors.dark.textMuted, fontSize: 12, textTransform: 'capitalize' },
  categoryTextActive: { color: Colors.dark.accent, fontWeight: '700' },
  context: { color: Colors.dark.textMuted, fontSize: 12, marginTop: 24 },
  save: { backgroundColor: Colors.dark.accent, borderRadius: 14, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  cancelText: { color: Colors.dark.textSecondary, fontSize: 14, fontWeight: '600' },
});
