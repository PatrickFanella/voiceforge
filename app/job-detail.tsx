import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  MapPin,
  Users,
  Calendar,
  Clock,
  FileText,
} from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { useApp } from '@/providers/AppProvider';

const statusConfig: Record<string, { color: string; label: string }> = {
  active: { color: Colors.dark.success, label: 'Active' },
  pending: { color: Colors.dark.warning, label: 'Pending' },
  completed: { color: Colors.dark.info, label: 'Completed' },
  paused: { color: Colors.dark.textMuted, label: 'Paused' },
};

const priorityConfig: Record<string, { color: string; label: string }> = {
  urgent: { color: Colors.dark.danger, label: 'Urgent' },
  high: { color: Colors.dark.accent, label: 'High Priority' },
  medium: { color: Colors.dark.warning, label: 'Medium Priority' },
  low: { color: Colors.dark.textMuted, label: 'Low Priority' },
};

export default function JobDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { jobs, timeEntries, deleteJob } = useApp();

  const job = jobs.find(j => j.id === id);
  const jobEntries = timeEntries.filter(e => e.jobId === id);

  if (!job) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Job not found</Text>
      </View>
    );
  }

  const status = statusConfig[job.status];
  const priority = priorityConfig[job.priority];
  const progress = job.hoursEstimated > 0
    ? Math.min((job.hoursLogged / job.hoursEstimated) * 100, 100)
    : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          testID="back-button"
        >
          <ArrowLeft size={22} color={Colors.dark.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Job Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleSection}>
          <View style={styles.badges}>
            <View style={[styles.badge, { backgroundColor: status.color + '20' }]}>
              <Text style={[styles.badgeText, { color: status.color }]}>{status.label}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: priority.color + '20' }]}>
              <Text style={[styles.badgeText, { color: priority.color }]}>{priority.label}</Text>
            </View>
          </View>
          <Text style={styles.jobTitle}>{job.title}</Text>
          <Text style={styles.jobClient}>{job.client}</Text>
        </View>

        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Progress</Text>
            <Text style={styles.progressValue}>{Math.round(progress)}%</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.progressHours}>
            {job.hoursLogged} of {job.hoursEstimated} hours
          </Text>
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.infoCard}>
            <MapPin size={16} color={Colors.dark.accent} />
            <Text style={styles.infoLabel}>Location</Text>
            <Text style={styles.infoValue}>{job.address}</Text>
          </View>
          <View style={styles.infoCard}>
            <Users size={16} color={Colors.dark.info} />
            <Text style={styles.infoLabel}>Crew</Text>
            <Text style={styles.infoValue}>{job.crew.join(', ')}</Text>
          </View>
          <View style={styles.infoCard}>
            <Calendar size={16} color={Colors.dark.warning} />
            <Text style={styles.infoLabel}>Due Date</Text>
            <Text style={styles.infoValue}>{job.dueDate}</Text>
          </View>
          <View style={styles.infoCard}>
            <Clock size={16} color={Colors.dark.success} />
            <Text style={styles.infoLabel}>Started</Text>
            <Text style={styles.infoValue}>{job.startDate}</Text>
          </View>
        </View>

        {job.notes.length > 0 && (
          <View style={styles.notesSection}>
            <View style={styles.sectionHeader}>
              <FileText size={16} color={Colors.dark.textSecondary} />
              <Text style={styles.sectionTitle}>Notes</Text>
            </View>
            {job.notes.map((note, i) => (
              <View key={i} style={styles.noteItem}>
                <View style={styles.noteBullet} />
                <Text style={styles.noteText}>{note}</Text>
              </View>
            ))}
          </View>
        )}

        {jobEntries.length > 0 && (
          <View style={styles.entriesSection}>
            <View style={styles.sectionHeader}>
              <Clock size={16} color={Colors.dark.textSecondary} />
              <Text style={styles.sectionTitle}>Time Entries</Text>
            </View>
            {jobEntries.map((entry) => (
              <View key={entry.id} style={styles.entryCard}>
                <View style={styles.entryLeft}>
                  <Text style={styles.entryTime}>
                    {entry.startTime} - {entry.endTime}
                  </Text>
                  <Text style={styles.entryNote}>{entry.notes}</Text>
                  <Text style={styles.entryDate}>{entry.date}</Text>
                </View>
                <View style={styles.entryRight}>
                  <Text style={styles.entryHours}>{entry.hours}h</Text>
                  {entry.type === 'overtime' && (
                    <Text style={styles.overtimeBadge}>OT</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.jobActions}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Edit job" style={styles.editJobButton} onPress={() => router.push({ pathname: '/job-edit', params: { id: job.id } } as never)}><Text style={styles.editJobText}>Edit job</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Delete job" style={styles.deleteJobButton} onPress={() => Alert.alert('Delete job?', 'Jobs with linked time or safety records cannot be deleted. This protects record integrity.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void deleteJob(job.id).then(() => router.back()).catch((error: unknown) => Alert.alert('Job not deleted', error instanceof Error ? error.message : 'Linked records must be removed first.')) }])}><Text style={styles.deleteJobText}>Delete job</Text></TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.dark.text,
    flex: 1,
    textAlign: 'center' as const,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  errorText: {
    color: Colors.dark.textSecondary,
    fontSize: 16,
    textAlign: 'center' as const,
    marginTop: 40,
  },
  titleSection: {
    marginBottom: 20,
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  jobTitle: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.dark.text,
  },
  jobClient: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
    marginTop: 4,
  },
  progressSection: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  progressLabel: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    fontWeight: '500' as const,
  },
  progressValue: {
    fontSize: 14,
    color: Colors.dark.accent,
    fontWeight: '700' as const,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.borderLight,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: Colors.dark.accent,
  },
  progressHours: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginTop: 8,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  infoCard: {
    width: '48%',
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: 4,
  },
  infoLabel: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginTop: 4,
  },
  infoValue: {
    fontSize: 13,
    color: Colors.dark.text,
    fontWeight: '500' as const,
  },
  notesSection: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark.text,
  },
  noteItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  noteBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.accent,
    marginTop: 6,
  },
  noteText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    flex: 1,
    lineHeight: 20,
  },
  entriesSection: {
    marginBottom: 20,
  },
  entryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  entryLeft: {
    flex: 1,
  },
  entryTime: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.dark.text,
  },
  entryNote: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    marginTop: 3,
  },
  entryDate: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginTop: 4,
  },
  entryRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
  },
  entryHours: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark.accent,
  },
  overtimeBadge: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: Colors.dark.warning,
    backgroundColor: Colors.dark.warningDim,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  jobActions: { gap: 10, marginTop: 8, marginBottom: 12 },
  editJobButton: { minHeight: 48, borderRadius: 12, backgroundColor: Colors.dark.accent, alignItems: 'center', justifyContent: 'center' },
  editJobText: { color: '#fff', fontWeight: '700' },
  deleteJobButton: { minHeight: 48, borderRadius: 12, borderColor: Colors.dark.danger, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  deleteJobText: { color: Colors.dark.danger, fontWeight: '700' },
});
