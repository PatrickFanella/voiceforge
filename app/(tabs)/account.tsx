import { Alert, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Database, Download, Shield, Trash2 } from 'lucide-react-native';

import { ScreenState } from '@/components/ScreenState';
import { Colors } from '@/constants/colors';
import { useApp } from '@/providers/AppProvider';

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const app = useApp();

  if (!app.ready || app.loadError) return <ScreenState loading={!app.ready} error={app.loadError} />;

  const exportData = async () => {
    const snapshot = await app.exportData();
    await Share.share({
      title: 'VoiceForge data export',
      message: JSON.stringify(snapshot, null, 2),
    });
  };

  const confirmClear = () => {
    Alert.alert(
      'Clear local data?',
      'This permanently removes jobs, reports, time entries, and voice logs from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear data', style: 'destructive', onPress: () => void app.clearData() },
      ],
    );
  };

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Account</Text>
      <View style={styles.profile}>
        <Text style={styles.name}>{app.worker.name}</Text>
        <Text style={styles.meta}>{app.worker.trade} · {app.worker.company}</Text>
        <Text style={styles.crew}>Crew ID {app.worker.crewId}</Text>
      </View>

      <View style={styles.infoCard}>
        <Database color={Colors.dark.info} size={20} />
        <View style={styles.infoText}>
          <Text style={styles.infoTitle}>Local-first storage</Text>
          <Text style={styles.infoBody}>Your field records are stored in an on-device SQLite database. VoiceForge currently has no account server or background sync.</Text>
        </View>
      </View>
      <View style={styles.infoCard}>
        <Shield color={Colors.dark.success} size={20} />
        <View style={styles.infoText}>
          <Text style={styles.infoTitle}>Review before action</Text>
          <Text style={styles.infoBody}>Voice notes never create time or safety records without your confirmation.</Text>
        </View>
      </View>

      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Export VoiceForge data" style={styles.action} onPress={() => void exportData()}>
        <Download color={Colors.dark.accent} size={19} />
        <Text style={styles.actionText}>Export data as JSON</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear all local VoiceForge data" style={[styles.action, styles.dangerAction]} onPress={confirmClear}>
        <Trash2 color={Colors.dark.danger} size={19} />
        <Text style={[styles.actionText, styles.dangerText]}>Clear local data</Text>
      </TouchableOpacity>
      <Text style={styles.version}>VoiceForge local MVP · schema 1</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  content: { padding: 20, paddingBottom: 110 },
  title: { color: Colors.dark.text, fontSize: 26, fontWeight: '700', marginTop: 12, marginBottom: 18 },
  profile: { backgroundColor: Colors.dark.surface, borderRadius: 16, borderColor: Colors.dark.border, borderWidth: 1, padding: 18, marginBottom: 14 },
  name: { color: Colors.dark.text, fontSize: 21, fontWeight: '700' },
  meta: { color: Colors.dark.textSecondary, fontSize: 14, marginTop: 4 },
  crew: { color: Colors.dark.textMuted, fontSize: 12, marginTop: 9 },
  infoCard: { flexDirection: 'row', gap: 12, padding: 15, backgroundColor: Colors.dark.surface, borderRadius: 13, marginBottom: 10 },
  infoText: { flex: 1 },
  infoTitle: { color: Colors.dark.text, fontSize: 14, fontWeight: '700' },
  infoBody: { color: Colors.dark.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 10, borderColor: Colors.dark.border, borderWidth: 1, borderRadius: 13, padding: 15, marginTop: 10 },
  dangerAction: { borderColor: Colors.dark.dangerDim },
  actionText: { color: Colors.dark.text, fontSize: 14, fontWeight: '700' },
  dangerText: { color: Colors.dark.danger },
  version: { color: Colors.dark.textMuted, fontSize: 11, textAlign: 'center', marginTop: 24 },
});
