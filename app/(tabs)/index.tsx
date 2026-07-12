import { Clock, Mic, ShieldAlert, Wrench } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import VoiceButton from '@/components/VoiceButton';
import { ScreenState } from '@/components/ScreenState';
import { Colors } from '@/constants/colors';
import { useApp } from '@/providers/AppProvider';

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const app = useApp();

  if (!app.ready || app.loadError) {
    return <ScreenState loading={!app.ready} error={app.loadError} />;
  }

  const unresolvedSafety = app.safetyReports.filter((report) => !report.resolved).length;

  const handleClock = async () => {
    if (app.clockedIn) {
      router.push('/clock-out' as never);
      return;
    }
    if (!app.activeJob) {
      Alert.alert('Select an active job', 'Choose a job before clocking in.');
      return;
    }
    try {
      await app.startClock(app.activeJob.id);
    } catch (error) {
      Alert.alert('Could not clock in', error instanceof Error ? error.message : 'Try again.');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}> 
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>VOICEFORGE</Text>
        <Text style={styles.title}>Good work starts with a clear record.</Text>

        <View style={styles.activeCard}>
          <View style={styles.row}>
            <Wrench color={Colors.dark.accent} size={20} />
            <Text style={styles.cardLabel}>Active job</Text>
          </View>
          <Text style={styles.activeTitle}>{app.activeJob?.title ?? 'No active job selected'}</Text>
          <Text style={styles.muted}>{app.activeJob?.client ?? 'Choose a job from the Jobs tab.'}</Text>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={app.clockedIn ? 'Clock out' : 'Clock in'}
          style={[styles.clockButton, app.clockedIn && styles.clockedIn]}
          onPress={() => void handleClock()}
        >
          <Clock color="#fff" size={22} />
          <Text style={styles.clockText}>{app.clockedIn ? 'Clock out' : 'Clock in'}</Text>
        </TouchableOpacity>

        <View style={styles.metrics}>
          <Metric icon={Clock} label="Today" value={`${app.todayHours.toFixed(1)}h`} />
          <Metric icon={Wrench} label="Active jobs" value={String(app.activeJobs.length)} />
          <Metric icon={ShieldAlert} label="Open safety" value={String(unresolvedSafety)} />
          <Metric icon={Mic} label="Voice logs" value={String(app.voiceLogs.length)} />
        </View>

        <Text style={styles.sectionTitle}>Recent voice logs</Text>
        {app.voiceLogs.slice(0, 3).map((log) => (
          <View key={log.id} style={styles.logCard}>
            <Text style={styles.logCategory}>{log.category.toUpperCase()}</Text>
            <Text style={styles.logText} numberOfLines={2}>{log.transcript}</Text>
          </View>
        ))}
      </ScrollView>
      <VoiceButton />
    </View>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Icon color={Colors.dark.accent} size={18} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  content: { padding: 20, paddingBottom: 110 },
  eyebrow: { color: Colors.dark.accent, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  title: { color: Colors.dark.text, fontSize: 28, fontWeight: '700', lineHeight: 34, marginTop: 8, marginBottom: 22 },
  activeCard: { backgroundColor: Colors.dark.surface, borderColor: Colors.dark.border, borderWidth: 1, borderRadius: 16, padding: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardLabel: { color: Colors.dark.textSecondary, fontSize: 13, fontWeight: '600' },
  activeTitle: { color: Colors.dark.text, fontSize: 20, fontWeight: '700', marginTop: 14 },
  muted: { color: Colors.dark.textMuted, fontSize: 13, marginTop: 4 },
  clockButton: { marginTop: 14, backgroundColor: Colors.dark.accent, borderRadius: 14, padding: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9 },
  clockedIn: { backgroundColor: Colors.dark.danger },
  clockText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  metric: { width: '48%', backgroundColor: Colors.dark.surface, borderRadius: 14, padding: 14, borderColor: Colors.dark.border, borderWidth: 1 },
  metricValue: { color: Colors.dark.text, fontSize: 22, fontWeight: '800', marginTop: 8 },
  metricLabel: { color: Colors.dark.textMuted, fontSize: 12, marginTop: 2 },
  sectionTitle: { color: Colors.dark.text, fontSize: 18, fontWeight: '700', marginTop: 24, marginBottom: 10 },
  logCard: { backgroundColor: Colors.dark.surface, borderRadius: 12, padding: 14, marginBottom: 8 },
  logCategory: { color: Colors.dark.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  logText: { color: Colors.dark.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 5 },
});
