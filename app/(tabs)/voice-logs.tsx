import { Mic } from 'lucide-react-native';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import VoiceButton from '@/components/VoiceButton';
import { ScreenState } from '@/components/ScreenState';
import { Colors } from '@/constants/colors';
import { useApp } from '@/providers/AppProvider';

export default function VoiceLogsScreen() {
  const insets = useSafeAreaInsets();
  const app = useApp();

  if (!app.ready || app.loadError) return <ScreenState loading={!app.ready} error={app.loadError} />;
  if (!app.voiceLogs.length) return <ScreenState empty="No voice logs yet. Tap the microphone to capture one." />;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}> 
      <Text style={styles.title}>Voice logs</Text>
      <FlatList
        data={app.voiceLogs}
        keyExtractor={(log) => log.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const job = app.jobs.find((candidate) => candidate.id === item.jobId);
          return (
            <View style={styles.card} accessible accessibilityLabel={`${item.category} voice log. ${item.transcript}`}>
              <View style={styles.metaRow}>
                <View style={styles.category}><Mic color={Colors.dark.accent} size={12} /><Text style={styles.categoryText}>{item.category}</Text></View>
                <Text style={styles.date}>{new Date(item.timestamp).toLocaleString()}</Text>
              </View>
              <Text style={styles.transcript}>{item.transcript}</Text>
              <Text style={styles.job}>{job?.title ?? 'No job attached'}</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Delete voice log" style={styles.deleteButton} onPress={() => Alert.alert('Delete voice log?', 'This removes the log record. Its audit deletion remains available in exports.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void app.deleteRecord('voice_log', item.id) }])}><Text style={styles.deleteText}>Delete</Text></TouchableOpacity>
            </View>
          );
        }}
      />
      <VoiceButton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  title: { color: Colors.dark.text, fontSize: 26, fontWeight: '700', marginHorizontal: 20, marginTop: 12 },
  list: { padding: 20, paddingBottom: 110 },
  card: { backgroundColor: Colors.dark.surface, borderColor: Colors.dark.border, borderWidth: 1, borderRadius: 14, padding: 15, marginBottom: 10 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  category: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  categoryText: { color: Colors.dark.accent, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  date: { color: Colors.dark.textMuted, fontSize: 10 },
  transcript: { color: Colors.dark.text, fontSize: 14, lineHeight: 20, marginTop: 10 },
  job: { color: Colors.dark.textMuted, fontSize: 11, marginTop: 10 },
  deleteButton: { borderTopColor: Colors.dark.border, borderTopWidth: 1, marginTop: 12, paddingTop: 10 },
  deleteText: { color: Colors.dark.danger, fontSize: 12, fontWeight: '700' },
});
