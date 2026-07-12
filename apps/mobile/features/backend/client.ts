export type Workspace = { id: string; name: string; kind: 'personal' | 'team'; role: 'owner' | 'admin' | 'supervisor' | 'worker' | 'auditor'; timeZone: string };
export class VoiceForgeApi {
  constructor(private readonly baseUrl: string, private readonly token: () => Promise<string | null>) {}
  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const accessToken = await this.token();
    if (!accessToken) throw new Error('Sign in is required.');
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers: { authorization: `Bearer ${accessToken}`, ...(init?.body ? { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() } : {}), ...init?.headers } });
    const body = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error((body as { error?: { message?: string } })?.error?.message ?? `Request failed (${response.status}).`);
    return body as T;
  }
}
