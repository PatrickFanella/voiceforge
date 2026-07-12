import http from 'k6/http';
import { check } from 'k6';
export const options = { scenarios: { reads: { executor: 'constant-arrival-rate', rate: 100, timeUnit: '1s', duration: '2m', preAllocatedVUs: 25, maxVUs: 100 } }, thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<300'] } };
export default function () { const response = http.get(`${__ENV.API_URL}/v1/health`); check(response, { healthy: (result) => result.status === 200 }); }
