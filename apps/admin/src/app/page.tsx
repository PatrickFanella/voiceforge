import { Dashboard } from '../components/dashboard';
import { auth0 } from '../lib/auth0';

export const dynamic = 'force-dynamic';
export default async function Home() {
  const session = await auth0.getSession();
  if (!session) return <main className="login"><div className="login-card"><p className="eyebrow">VOICEFORGE OPERATIONS</p><h1>Field evidence, under control.</h1><p>Sign in to manage crews, approve time, and triage safety reports.</p><a className="primary" href="/auth/login">Sign in securely</a></div></main>;
  return <Dashboard userName={session.user.name ?? session.user.email ?? 'Supervisor'} />;
}
