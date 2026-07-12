import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Shield,
  Clock,
  AlertTriangle,
  CheckCircle,
  Eye,
  FileCheck,
  Mic,
} from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { useApp } from '@/providers/AppProvider';
import VoiceButton from '@/components/VoiceButton';
import { ScreenState } from '@/components/ScreenState';
import * as Haptics from 'expo-haptics';

type TabType = 'safety' | 'time';

const severityConfig: Record<string, { color: string }> = {
  low: { color: Colors.dark.success },
  medium: { color: Colors.dark.warning },
  high: { color: Colors.dark.accent },
  critical: { color: Colors.dark.danger },
};

const typeConfig: Record<string, { icon: typeof Shield; label: string }> = {
  incident: { icon: AlertTriangle, label: 'Incident' },
  hazard: { icon: Eye, label: 'Hazard' },
  inspection: { icon: Shield, label: 'Inspection' },
  compliance: { icon: FileCheck, label: 'Compliance' },
};

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { safetyReports, timeEntries, deleteRecord } = useApp();
  const [tab, setTab] = useState<TabType>('safety');

  const safetySections = useMemo(() => {
    const grouped: Record<string, typeof safetyReports> = {};
    safetyReports.forEach(r => {
      if (!grouped[r.date]) grouped[r.date] = [];
      grouped[r.date].push(r);
    });
    return Object.entries(grouped).map(([date, data]) => ({ title: date, data }));
  }, [safetyReports]);

  const timeSections = useMemo(() => {
    const grouped: Record<string, typeof timeEntries> = {};
    timeEntries.forEach(e => {
      if (!grouped[e.date]) grouped[e.date] = [];
      grouped[e.date].push(e);
    });
    return Object.entries(grouped).map(([date, data]) => ({
      title: date,
      data,
      total: data.reduce((s, e) => s + e.hours, 0),
    }));
  }, [timeEntries]);

  const handleTabPress = (t: TabType) => {
    Haptics.selectionAsync();
    setTab(t);
  };

  const confirmDelete = (entityType: 'time_entry' | 'safety_report', id: string) => {
    Alert.alert('Delete record?', 'The record is removed, but its deletion remains in the audit history.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteRecord(entityType, id) },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Reports</Text>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'safety' && styles.tabActive]}
          onPress={() => handleTabPress('safety')}
        >
          <Shield size={16} color={tab === 'safety' ? Colors.dark.accent : Colors.dark.textMuted} />
          <Text style={[styles.tabText, tab === 'safety' && styles.tabTextActive]}>Safety</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'time' && styles.tabActive]}
          onPress={() => handleTabPress('time')}
        >
          <Clock size={16} color={tab === 'time' ? Colors.dark.accent : Colors.dark.textMuted} />
          <Text style={[styles.tabText, tab === 'time' && styles.tabTextActive]}>Time Log</Text>
        </TouchableOpacity>
      </View>

      {tab === 'safety' ? (
        <SectionList
          sections={safetySections}
          keyExtractor={(item) => item.id}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionDate}>{section.title}</Text>
          )}
          renderItem={({ item }) => {
            const typeInfo = typeConfig[item.type];
            const severity = severityConfig[item.severity];
            const TypeIcon = typeInfo?.icon ?? Shield;
            return (
              <View style={styles.reportCard}>
                <View style={styles.reportTop}>
                  <View style={styles.reportTypeRow}>
                    <View style={[styles.typeIcon, { backgroundColor: severity.color + '20' }]}>
                      <TypeIcon size={14} color={severity.color} />
                    </View>
                    <Text style={styles.reportType}>{typeInfo?.label ?? item.type}</Text>
                    <View style={[styles.severityDot, { backgroundColor: severity.color }]} />
                    <Text style={[styles.severityText, { color: severity.color }]}>
                      {item.severity.toUpperCase()}
                    </Text>
                  </View>
                  {item.voiceLogged && <Mic size={12} color={Colors.dark.textMuted} />}
                </View>
                <Text style={styles.reportDesc}>{item.description}</Text>
                <View style={styles.reportBottom}>
                  <Text style={styles.reportJob}>{item.jobTitle}</Text>
                  {item.resolved && (
                    <View style={styles.resolvedBadge}>
                      <CheckCircle size={11} color={Colors.dark.success} />
                      <Text style={styles.resolvedText}>Resolved</Text>
                    </View>
                  )}
                </View>
                <View style={styles.recordActions}>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Edit safety report" onPress={() => router.push({ pathname: '/record-edit', params: { entityType: 'safety_report', id: item.id } } as never)}><Text style={styles.editText}>Edit</Text></TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Delete safety report" onPress={() => confirmDelete('safety_report', item.id)}><Text style={styles.deleteText}>Delete</Text></TouchableOpacity>
                </View>
              </View>
            );
          }}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={<ScreenState empty="No safety reports yet." />}
        />
      ) : (
        <SectionList
          sections={timeSections}
          keyExtractor={(item) => item.id}
          renderSectionHeader={({ section }) => (
            <View style={styles.timeSectionHeader}>
              <Text style={styles.sectionDate}>{section.title}</Text>
              <Text style={styles.sectionTotal}>
                {(section as any).total?.toFixed(1)}h
              </Text>
            </View>
          )}
          renderItem={({ item }) => (
            <View style={styles.timeCard}>
              <View style={styles.timeLeft}>
                <View style={styles.timeRange}>
                  <Text style={styles.timeStart}>{item.startTime}</Text>
                  <View style={styles.timeLine} />
                  <Text style={styles.timeEnd}>{item.endTime}</Text>
                </View>
              </View>
              <View style={styles.timeRight}>
                <Text style={styles.timeJob}>{item.jobTitle}</Text>
                <Text style={styles.timeNote}>{item.notes}</Text>
                <View style={styles.timeMetaRow}>
                  <Text style={styles.timeHours}>{item.hours}h</Text>
                  {item.type === 'overtime' && (
                    <View style={styles.otBadge}>
                      <Text style={styles.otText}>OT</Text>
                    </View>
                  )}
                  {item.voiceLogged && <Mic size={11} color={Colors.dark.textMuted} />}
                </View>
                <View style={styles.recordActions}>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Edit time entry" onPress={() => router.push({ pathname: '/record-edit', params: { entityType: 'time_entry', id: item.id } } as never)}><Text style={styles.editText}>Edit</Text></TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Delete time entry" onPress={() => confirmDelete('time_entry', item.id)}><Text style={styles.deleteText}>Delete</Text></TouchableOpacity>
                </View>
              </View>
            </View>
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={<ScreenState empty="No time entries yet." />}
        />
      )}

      <VoiceButton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '700' as const,
    color: Colors.dark.text,
  },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: Colors.dark.accentDim,
  },
  tabText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    fontWeight: '500' as const,
  },
  tabTextActive: {
    color: Colors.dark.accent,
    fontWeight: '600' as const,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  sectionDate: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    fontWeight: '600' as const,
    marginBottom: 8,
    marginTop: 8,
  },
  reportCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  reportTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reportTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typeIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportType: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.dark.text,
  },
  severityDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginLeft: 4,
  },
  severityText: {
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
  reportDesc: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    lineHeight: 19,
  },
  reportBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  reportJob: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  resolvedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resolvedText: {
    fontSize: 11,
    color: Colors.dark.success,
    fontWeight: '500' as const,
  },
  timeSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 8,
  },
  sectionTotal: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.dark.accent,
  },
  timeCard: {
    flexDirection: 'row',
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: 14,
  },
  timeLeft: {
    alignItems: 'center',
  },
  timeRange: {
    alignItems: 'center',
    gap: 2,
  },
  timeStart: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.dark.text,
  },
  timeLine: {
    width: 1,
    height: 16,
    backgroundColor: Colors.dark.borderLight,
  },
  timeEnd: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.dark.textSecondary,
  },
  timeRight: {
    flex: 1,
  },
  timeJob: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.dark.text,
  },
  timeNote: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    marginTop: 3,
  },
  timeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  timeHours: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.dark.accent,
  },
  otBadge: {
    backgroundColor: Colors.dark.warningDim,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  otText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: Colors.dark.warning,
  },
  recordActions: { flexDirection: 'row', gap: 18, marginTop: 12, paddingTop: 10, borderTopColor: Colors.dark.border, borderTopWidth: 1 },
  editText: { color: Colors.dark.accent, fontSize: 12, fontWeight: '700' },
  deleteText: { color: Colors.dark.danger, fontSize: 12, fontWeight: '700' },
});
