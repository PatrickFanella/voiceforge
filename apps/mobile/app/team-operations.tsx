import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { useBackendAuth } from '@/features/backend/AuthProvider';
import { VoiceForgeApi, type Workspace } from '@/features/backend/client';

type TimeApproval = { id: string; workerUserId: string; totalMinutes: number; notes: string };
type SafetyReport = { id: string; severity: string; status: string; reportType: string; description: string };
export default function TeamOperationsScreen() {
  const insets = useSafeAreaInsets(); const auth = useBackendAuth();
  const api = useMemo(() => new VoiceForgeApi(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000', auth.accessToken), [auth.accessToken]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]); const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [time, setTime] = useState<TimeApproval[]>([]); const [safety, setSafety] = useState<SafetyReport[]>([]); const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!auth.signedIn) return;
    try {
      const bootstrap = await api.request<{ workspaces: Workspace[] }>('/v1/auth/bootstrap', { method: 'POST', body: '{}' });
      setWorkspaces(bootstrap.workspaces); const selected = workspace ?? bootstrap.workspaces.find((item) => item.kind === 'team') ?? bootstrap.workspaces[0] ?? null; setWorkspace(selected);
      if (!selected) return;
      if (['owner', 'admin', 'supervisor'].includes(selected.role) && selected.kind === 'team') {
        const [approvals, triage] = await Promise.all([api.request<{ data: TimeApproval[] }>(`/v1/time-approvals?workspaceId=${selected.id}`), api.request<{ data: SafetyReport[] }>(`/v1/safety-reports?workspaceId=${selected.id}`)]);
        setTime(approvals.data); setSafety(triage.data);
      } else { setTime([]); setSafety([]); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load team operations.'); }
  }, [api, auth.signedIn, workspace]);
  useEffect(() => { void refresh(); }, [refresh]);
  const mutate = async (path: string, body: unknown) => { try { await api.request(path, { method: 'POST', body: JSON.stringify(body) }); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Action failed.'); } };
  if (auth.loading) return <View style={styles.center}><ActivityIndicator /></View>;
  return <ScrollView style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={styles.content}>
    <Text style={styles.title}>Team operations</Text>
    {!auth.configured && <Card><Text style={styles.heading}>Offline mode is ready</Text><Text style={styles.muted}>Set the Auth0 and API public environment values in a development or production build to enable team management. Local field records remain available without them.</Text></Card>}
    {auth.configured && !auth.signedIn && <TouchableOpacity style={styles.primary} onPress={() => void auth.signIn()}><Text style={styles.primaryText}>Sign in securely</Text></TouchableOpacity>}
    {auth.signedIn && <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>{workspaces.map((item) => <TouchableOpacity key={item.id} style={[styles.pill, workspace?.id === item.id && styles.pillActive]} onPress={() => { setWorkspace(item); setTimeout(() => void refresh(), 0); }}><Text style={styles.text}>{item.name} · {item.role}</Text></TouchableOpacity>)}</ScrollView>
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {workspace && !['owner', 'admin', 'supervisor'].includes(workspace.role) && <Card><Text style={styles.heading}>Worker workspace</Text><Text style={styles.muted}>Time and safety submissions sync here. Supervisor actions are hidden for your role.</Text></Card>}
      {time.map((entry) => <Card key={entry.id}><Text style={styles.heading}>{(entry.totalMinutes / 60).toFixed(2)} hours · {entry.workerUserId.slice(0, 8)}</Text><Text style={styles.muted}>{entry.notes || 'No notes'}</Text><TouchableOpacity style={styles.primary} onPress={() => void mutate(`/v1/time-approvals/${entry.id}`, { workspaceId: workspace?.id, decision: 'approved' })}><Text style={styles.primaryText}>Approve time</Text></TouchableOpacity></Card>)}
      {safety.map((report) => <Card key={report.id}><Text style={[styles.heading, report.severity === 'critical' && styles.critical]}>{report.severity.toUpperCase()} · {report.reportType}</Text><Text style={styles.muted}>{report.description}</Text>{report.status === 'submitted' && <TouchableOpacity style={styles.primary} onPress={() => void mutate(`/v1/safety-reports/${report.id}/acknowledgements`, { workspaceId: workspace?.id, note: 'Acknowledged on mobile' })}><Text style={styles.primaryText}>Acknowledge</Text></TouchableOpacity>}</Card>)}
      <TouchableOpacity style={styles.secondary} onPress={() => void auth.signOut()}><Text style={styles.text}>Sign out</Text></TouchableOpacity>
    </>}
  </ScrollView>;
}
function Card({ children }: { children: React.ReactNode }) { return <View style={styles.card}>{children}</View>; }
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: Colors.dark.background }, content: { padding: 20, paddingBottom: 80, gap: 12 }, center: { flex: 1, justifyContent: 'center' }, title: { color: Colors.dark.text, fontSize: 26, fontWeight: '700', marginTop: 12 }, heading: { color: Colors.dark.text, fontSize: 16, fontWeight: '700' }, muted: { color: Colors.dark.textMuted, lineHeight: 20 }, text: { color: Colors.dark.text }, critical: { color: Colors.dark.danger }, error: { color: Colors.dark.danger }, card: { gap: 10, backgroundColor: Colors.dark.surface, borderColor: Colors.dark.border, borderWidth: 1, borderRadius: 14, padding: 16 }, pill: { borderColor: Colors.dark.border, borderWidth: 1, borderRadius: 20, padding: 10, marginRight: 8 }, pillActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim }, primary: { backgroundColor: Colors.dark.accent, borderRadius: 10, padding: 12, alignItems: 'center' }, primaryText: { color: Colors.dark.background, fontWeight: '700' }, secondary: { borderColor: Colors.dark.border, borderWidth: 1, borderRadius: 10, padding: 12, alignItems: 'center' } });
