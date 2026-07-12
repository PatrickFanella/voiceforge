'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

export const NAV_ITEMS = [
  ['overview', 'Overview'], ['team', 'Team'], ['jobs', 'Jobs'], ['time', 'Time approvals'], ['safety', 'Safety triage'],
  ['audit', 'Audit'], ['policies', 'Policies'], ['integrations', 'Integrations'], ['billing', 'Billing'], ['deliveries', 'Deliveries'],
] as const;
type View = typeof NAV_ITEMS[number][0];
export const canSupervise = (workspace: Pick<Workspace, 'kind' | 'role'> | undefined) => Boolean(workspace?.kind === 'team' && ['owner', 'admin', 'supervisor'].includes(workspace.role));
type Workspace = { id: string; name: string; kind: 'personal' | 'team'; role: string; timeZone: string };
type Member = { userId: string; displayName: string | null; email: string | null; role: string; status: string };
type TimeEntry = { id: string; workerUserId: string; status: string; totalMinutes: number; startedAt: string; endedAt: string; notes: string };
type SafetyReport = { id: string; severity: string; status: string; reportType: string; description: string; acknowledgementDueAt: string | null; escalationLevel: number };
type Delivery = { id: string; channel: string; destination: string; eventType: string; status: string; attemptCount: number; lastError: string | null };
type BillingState = { subscription: null | { status: string; seatQuantity: number; pendingSeatQuantity: number | null; currentPeriodEnd: string | null }; entitlement: { mutationEnabled: boolean; seatLimit: number }; activeSeats: number };

export function Dashboard({ userName }: { userName: string }) {
  const [view, setView] = useState<View>('overview');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [safety, setSafety] = useState<SafetyReport[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [jobs, setJobs] = useState<Array<{ id: string; name: string; status: string; address: string | null }>>([]);
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState('');
  const workspace = workspaces.find((item) => item.id === workspaceId);
  const supervisor = canSupervise(workspace);

  const request = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}${path}`, {
      ...init, headers: { authorization: `Bearer ${token}`, ...(init?.body ? { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() } : {}), ...init?.headers },
    });
    const body: any = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error(body?.error?.message ?? `Request failed (${response.status}).`);
    return body as T;
  }, [token]);

  useEffect(() => { void (async () => {
    try {
      const tokenResponse = await fetch('/auth/access-token');
      if (!tokenResponse.ok) throw new Error('Your session could not provide an API token.');
      const tokenBody = await tokenResponse.json() as { token?: string; accessToken?: string };
      const accessToken = tokenBody.token ?? tokenBody.accessToken;
      if (!accessToken) throw new Error('The API access token was missing.');
      setToken(accessToken);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Authentication failed.'); setLoading(false); }
  })(); }, []);

  useEffect(() => { if (!token) return; void (async () => {
    try {
      const bootstrap = await request<{ workspaces: Workspace[] }>('/v1/auth/bootstrap', { method: 'POST', body: '{}' });
      setWorkspaces(bootstrap.workspaces);
      setWorkspaceId((current) => current || bootstrap.workspaces.find((item) => item.kind === 'team')?.id || bootstrap.workspaces[0]?.id || '');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Bootstrap failed.'); } finally { setLoading(false); }
  })(); }, [request, token]);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setError(null);
    const safe = async <T,>(path: string, fallback: T) => { try { return await request<T>(path); } catch { return fallback; } };
    const [memberData, jobData, timeData, safetyData, deliveryData, billingData] = await Promise.all([
      safe<{ data: Member[] }>(`/v1/workspaces/${workspaceId}/memberships`, { data: [] }),
      safe<{ data: typeof jobs }>(`/v1/workspaces/${workspaceId}/jobs`, { data: [] }),
      safe<{ data: TimeEntry[] }>(`/v1/time-approvals?workspaceId=${workspaceId}`, { data: [] }),
      safe<{ data: SafetyReport[] }>(`/v1/safety-reports?workspaceId=${workspaceId}`, { data: [] }),
      safe<{ data: Delivery[] }>(`/v1/admin/delivery-diagnostics?workspaceId=${workspaceId}`, { data: [] }),
      safe<BillingState | null>(`/v1/billing/status?workspaceId=${workspaceId}`, null),
    ]);
    setMembers(memberData.data); setJobs(jobData.data); setTimeEntries(timeData.data); setSafety(safetyData.data); setDeliveries(deliveryData.data); setBilling(billingData);
  }, [request, workspaceId]);
  useEffect(() => { void refresh(); }, [refresh]);

  const mutate = async (path: string, body: unknown, method = 'POST'): Promise<void> => {
    try { await request(path, { method, body: JSON.stringify(body) }); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Action failed.'); }
  };
  const criticalOpen = safety.filter((item) => item.severity === 'critical' && item.status === 'submitted').length;
  const overdue = safety.filter((item) => item.status === 'submitted' && item.acknowledgementDueAt && new Date(item.acknowledgementDueAt) < new Date()).length;
  const failedDeliveries = deliveries.filter((item) => item.status === 'failed' || item.status === 'dead_letter').length;

  if (loading) return <main className="loading" aria-busy="true">Loading secure workspace…</main>;
  return <div className="shell">
    <aside><div className="brand"><span>VF</span><div><strong>VoiceForge</strong><small>Supervisor</small></div></div>
      <nav aria-label="Primary">{NAV_ITEMS.map(([id, label]) => <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>{label}</button>)}</nav>
      <a className="signout" href="/auth/logout">Sign out</a>
    </aside>
    <main className="main"><header><div><p className="eyebrow">{workspace?.kind === 'team' ? 'TEAM WORKSPACE' : 'PERSONAL WORKSPACE'}</p><h1>{NAV_ITEMS.find(([id]) => id === view)?.[1]}</h1></div>
      <div className="header-actions"><label><span>Workspace</span><select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="user">{userName}</div></div></header>
      {error && <div className="error" role="alert">{error}</div>}
      {view === 'overview' && <section><div className="metrics"><Metric label="Pending time" value={timeEntries.length} /><Metric label="Critical unacked" value={criticalOpen} danger /><Metric label="SLA overdue" value={overdue} danger={overdue > 0} /><Metric label="Failed delivery" value={failedDeliveries} danger={failedDeliveries > 0} /></div><div className="grid"><Panel title="Safety attention"><SafetyTable data={safety.slice(0, 5)} workspaceId={workspaceId} mutate={mutate} /></Panel><Panel title="Time awaiting review"><TimeTable data={timeEntries.slice(0, 5)} workspaceId={workspaceId} mutate={mutate} /></Panel></div></section>}
      {view === 'team' && (workspace?.kind === 'team' && ['owner', 'admin'].includes(workspace.role) ? <TeamPanel members={members} workspaceId={workspaceId} mutate={mutate} /> : <Restricted />)}
      {view === 'jobs' && <Panel title="Jobs and crews"><table><thead><tr><th>Job</th><th>Address</th><th>Status</th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id}><td>{job.name}</td><td>{job.address || '—'}</td><td><Status value={job.status} /></td></tr>)}</tbody></table></Panel>}
      {view === 'time' && (supervisor ? <Panel title="Time approval queue"><TimeTable data={timeEntries} workspaceId={workspaceId} mutate={mutate} /></Panel> : <Restricted />)}
      {view === 'safety' && (supervisor ? <Panel title="Safety triage board"><SafetyTable data={safety} workspaceId={workspaceId} mutate={mutate} /></Panel> : <Restricted />)}
      {view === 'deliveries' && <Panel title="Delivery diagnostics"><table><thead><tr><th>Channel</th><th>Destination</th><th>Event</th><th>Status</th><th>Attempts</th></tr></thead><tbody>{deliveries.map((item) => <tr key={item.id}><td>{item.channel}</td><td>{item.destination}</td><td>{item.eventType}</td><td><Status value={item.status} /></td><td>{item.attemptCount}</td></tr>)}</tbody></table></Panel>}
      {view === 'policies' && <PolicyPanel workspaceId={workspaceId} mutate={mutate} />}
      {view === 'billing' && (workspace?.kind === 'team' && workspace.role === 'owner' ? <BillingPanel state={billing} workspaceId={workspaceId} request={request} /> : <Restricted />)}
      {(['audit', 'integrations'] as View[]).includes(view) && <Panel title={NAV_ITEMS.find(([id]) => id === view)?.[1] ?? view}><p className="muted">This control surface is connected as its backend milestone lands. Current access remains read-only and no settings are implied.</p></Panel>}
    </main>
  </div>;
}

function Metric({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) { return <div className={`metric ${danger ? 'danger' : ''}`}><span>{label}</span><strong>{value}</strong></div>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <div className="panel"><h2>{title}</h2>{children}</div>; }
function Restricted() { return <Panel title="Unavailable in this workspace"><p className="muted">This workflow requires a team workspace and an authorized administrative role.</p></Panel>; }
function Status({ value }: { value: string }) { return <span className={`status status-${value}`}>{value.replaceAll('_', ' ')}</span>; }
function TimeTable({ data, workspaceId, mutate }: { data: TimeEntry[]; workspaceId: string; mutate: (path: string, body: unknown) => Promise<void> }) { return <table><thead><tr><th>Worker</th><th>Duration</th><th>Notes</th><th>Action</th></tr></thead><tbody>{data.map((entry) => <tr key={entry.id}><td>{entry.workerUserId.slice(0, 8)}</td><td>{(entry.totalMinutes / 60).toFixed(2)}h</td><td>{entry.notes || '—'}</td><td className="actions"><button onClick={() => void mutate(`/v1/time-approvals/${entry.id}`, { workspaceId, decision: 'approved' })}>Approve</button><button className="secondary" onClick={() => void mutate(`/v1/time-approvals/${entry.id}`, { workspaceId, decision: 'correction_requested', reason: 'Please review this entry.' })}>Correction</button></td></tr>)}</tbody></table>; }
function SafetyTable({ data, workspaceId, mutate }: { data: SafetyReport[]; workspaceId: string; mutate: (path: string, body: unknown) => Promise<void> }) { return <table><thead><tr><th>Severity</th><th>Report</th><th>Status</th><th>Action</th></tr></thead><tbody>{data.map((report) => <tr key={report.id}><td><Status value={report.severity} /></td><td><strong>{report.reportType}</strong><small>{report.description}</small></td><td><Status value={report.status} /></td><td className="actions">{report.status === 'submitted' && <button onClick={() => void mutate(`/v1/safety-reports/${report.id}/acknowledgements`, { workspaceId, note: 'Acknowledged in supervisor console' })}>Acknowledge</button>}{report.status === 'acknowledged' && <button onClick={() => void mutate(`/v1/safety-reports/${report.id}/transitions`, { workspaceId, status: 'investigating' })}>Investigate</button>}</td></tr>)}</tbody></table>; }
function TeamPanel({ members, workspaceId, mutate }: { members: Member[]; workspaceId: string; mutate: (path: string, body: unknown, method?: string) => Promise<void> }) {
  const invite = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); await mutate(`/v1/workspaces/${workspaceId}/invitations`, { email: form.get('email'), role: form.get('role') }); event.currentTarget.reset(); };
  return <div className="grid"><Panel title="Members"><table><thead><tr><th>Member</th><th>Role</th><th>Status</th></tr></thead><tbody>{members.map((member) => <tr key={member.userId}><td><strong>{member.displayName || member.email || 'Unnamed'}</strong><small>{member.email}</small></td><td><select value={member.role} onChange={(event) => void mutate(`/v1/workspaces/${workspaceId}/memberships/${member.userId}`, { workspaceId, role: event.target.value }, 'PATCH')}>{['owner', 'admin', 'supervisor', 'worker', 'auditor'].map((role) => <option key={role}>{role}</option>)}</select></td><td><Status value={member.status} /></td></tr>)}</tbody></table></Panel><Panel title="Invite teammate"><form onSubmit={(event) => void invite(event)}><label>Email<input name="email" type="email" required /></label><label>Role<select name="role" defaultValue="worker"><option>worker</option><option>supervisor</option><option>auditor</option><option>admin</option></select></label><button type="submit">Send invitation</button></form></Panel></div>;
}
function PolicyPanel({ workspaceId, mutate }: { workspaceId: string; mutate: (path: string, body: unknown, method?: string) => Promise<void> }) { return <Panel title="Safety escalation policy"><form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void mutate('/v1/admin/safety-policy', { workspaceId, acknowledgementSlaMinutes: Number(data.get('sla')), escalationRepeatMinutes: Number(data.get('repeat')), emergencyInstructions: data.get('emergency') }, 'PUT'); }}><label>Acknowledgement SLA (minutes)<input name="sla" type="number" min="1" max="1440" defaultValue="15" /></label><label>Repeat escalation (minutes)<input name="repeat" type="number" min="1" max="1440" defaultValue="15" /></label><label>Emergency instructions<textarea name="emergency" defaultValue="If anyone is in immediate danger, contact local emergency services now." /></label><button type="submit">Save policy</button></form></Panel>; }
function BillingPanel({ state, workspaceId, request }: { state: BillingState | null; workspaceId: string; request: <T>(path: string, init?: RequestInit) => Promise<T> }) {
  const redirect = async (path: string, body: unknown) => { const result = await request<{ url: string }>(path, { method: 'POST', body: JSON.stringify(body) }); window.location.assign(result.url); };
  return <div className="grid"><Panel title="Subscription"><p><Status value={state?.subscription?.status ?? 'not_subscribed'} /></p><p className="muted">{state?.activeSeats ?? 1} active of {state?.entitlement.seatLimit ?? 1} seats{state?.subscription?.pendingSeatQuantity ? ` · ${state.subscription.pendingSeatQuantity} at renewal` : ''}</p>{state?.subscription ? <button onClick={() => void redirect('/v1/billing/portal', { workspaceId, returnUrl: window.location.href })}>Open billing portal</button> : <button onClick={() => void redirect('/v1/billing/checkout', { workspaceId, quantity: Math.max(1, state?.activeSeats ?? 1), successUrl: window.location.href, cancelUrl: window.location.href })}>Start team plan</button>}</Panel>{state?.subscription && <Panel title="Seat quantity"><form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void request('/v1/billing/seats', { method: 'POST', body: JSON.stringify({ workspaceId, quantity: Number(form.get('quantity')) }) }); }}><label>Seats<input name="quantity" type="number" min={state.activeSeats} defaultValue={state.subscription.seatQuantity} /></label><button type="submit">Update seats</button></form></Panel>}</div>;
}
