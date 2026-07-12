import { writeFile } from 'node:fs/promises';
import { buildApp } from '../src/app.js';

const unavailable = async () => { throw new Error('Dependency is unavailable during contract generation.'); };
const app = await buildApp({
  verifier: { verify: unavailable },
  tenancy: {
    bootstrapIdentity: unavailable,
    createTeam: unavailable,
    getAccess: unavailable,
    createInvitation: unavailable,
    acceptInvitation: unavailable,
    listMembers: unavailable, listInvitations: unavailable, updateMemberRole: unavailable, removeMember: unavailable,
  },
  jobs: { list: unavailable, create: unavailable, update: unavailable, delete: unavailable, listMembers: unavailable, assignMember: unavailable, removeMember: unavailable },
  sync: { pull: unavailable },
  cursorSecret: 'contract-generation-only',
  transcription: {
    repository: { createAudioObject: unavailable, getAudioObject: unavailable, createJob: unavailable, getJob: unavailable, getWork: unavailable, reviewTranscript: unavailable },
    storage: { signUpload: unavailable, requiredUploadHeaders: () => ({}), verifyUpload: unavailable }, queue: { enqueue: unavailable },
  },
  time: { startClock: unavailable, stopClock: unavailable, createDraft: unavailable, editDraft: unavailable, submit: unavailable, decide: unavailable, correct: unavailable, listApprovalQueue: unavailable, history: unavailable },
  safety: {
    repository: { registerPushToken: unavailable, configurePolicy: unavailable, configureContacts: unavailable, createDraft: unavailable, submit: unavailable, acknowledge: unavailable, transition: unavailable, correct: unavailable, assign: unavailable, silence: unavailable, listTriage: unavailable, listDeliveries: unavailable },
    queue: { enqueue: unavailable },
  },
  billing: { repository: { get: unavailable, saveCustomer: unavailable, findCustomer: unavailable, setPendingSeatQuantity: unavailable, reconcile: unavailable }, stripe: { createCustomer: unavailable, createCheckout: unavailable, createPortal: unavailable, updateSeats: unavailable, parseWebhook: unavailable } },
  integrations: { repository: { createExport: unavailable, getExport: unavailable, listExports: unavailable, createEndpoint: unavailable, listEndpoints: unavailable, listDeliveries: unavailable, setEndpointEnabled: unavailable, replayDelivery: unavailable }, exportQueue: { enqueue: unavailable }, exportStorage: { signDownload: unavailable }, secretKey: 'openapi-generation-secret' },
  governance: { repository: { getPolicy: unavailable, configurePolicy: unavailable, createHold: unavailable, listHolds: unavailable, releaseHold: unavailable, searchAuditEvents: unavailable, createSubjectRequest: unavailable, getSubjectRequest: unavailable, validateAuditChain: unavailable }, queue: { enqueue: unavailable }, storage: { signDownload: unavailable } },
});
await app.ready();
await writeFile(new URL('../openapi.json', import.meta.url), `${JSON.stringify(app.swagger(), null, 2)}\n`);
await app.close();
