export const REDACT_PATHS = ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie', '*.accessToken', '*.refreshToken', '*.transcript', '*.audioUrl', '*.secret', '*.signingSecret', '*.payload'];
export async function startTracing(serviceName: string) {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return { shutdown: async () => undefined };
  const [{ NodeSDK }, { OTLPTraceExporter }, { getNodeAutoInstrumentations }] = await Promise.all([import('@opentelemetry/sdk-node'), import('@opentelemetry/exporter-trace-otlp-http'), import('@opentelemetry/auto-instrumentations-node')]);
  const sdk = new NodeSDK({ serviceName, traceExporter: new OTLPTraceExporter({ url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, '')}/v1/traces` }), instrumentations: [getNodeAutoInstrumentations({ '@opentelemetry/instrumentation-fs': { enabled: false } })] });
  sdk.start();
  return { shutdown: () => sdk.shutdown() };
}
export class MetricsRegistry {
  private readonly counts = new Map<string, number>(); private readonly durations = new Map<string, number[]>();
  increment(name: string, labels: Record<string, string> = {}) { const key = metricKey(name, labels); this.counts.set(key, (this.counts.get(key) ?? 0) + 1); }
  observe(name: string, milliseconds: number, labels: Record<string, string> = {}) { const key = metricKey(name, labels); const values = this.durations.get(key) ?? []; values.push(milliseconds); if (values.length > 1000) values.shift(); this.durations.set(key, values); }
  prometheus() { const lines: string[] = []; for (const [key, value] of this.counts) lines.push(`${key} ${value}`); for (const [key, values] of this.durations) { const sorted = [...values].sort((a,b) => a-b); lines.push(`${key}_count ${values.length}`, `${key}_sum ${values.reduce((a,b)=>a+b,0)}`, `${key}_p95 ${sorted[Math.max(0, Math.ceil(sorted.length*.95)-1)] ?? 0}`); } return `${lines.join('\n')}\n`; }
}
const metricKey = (name: string, labels: Record<string,string>) => { const entries = Object.entries(labels).sort(([a],[b]) => a.localeCompare(b)); return entries.length ? `${name}{${entries.map(([key,value]) => `${key}="${value.replaceAll('"','')}"`).join(',')}}` : name; };
