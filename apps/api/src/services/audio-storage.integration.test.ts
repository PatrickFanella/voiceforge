import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { S3AudioStorage } from './audio-storage.js';

const endpoint = process.env.TEST_S3_ENDPOINT;
const suite = endpoint ? describe : describe.skip;

suite('S3AudioStorage against MinIO', () => {
  const bucket = `voiceforge-test-${Date.now()}`;
  const client = new S3Client({ region: 'us-east-1', endpoint: endpoint!, forcePathStyle: true });
  const storage = new S3AudioStorage(client, bucket, null);
  beforeAll(async () => { await client.send(new CreateBucketCommand({ Bucket: bucket })); });
  afterAll(() => client.destroy());

  it('signs a private encrypted upload and validates stored type and length', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const url = await storage.signUpload({ key: 'workspaces/test/audio/one', contentType: 'audio/m4a', bytes: bytes.length, expiresInSeconds: 60 });
    const response = await fetch(url, {
      method: 'PUT', body: bytes,
      headers: storage.requiredUploadHeaders('audio/m4a', bytes.length),
    });
    expect(response.status).toBe(200);
    await expect(storage.verifyUpload({ key: 'workspaces/test/audio/one', contentType: 'audio/m4a', bytes: bytes.length })).resolves.toBeUndefined();
    await expect(storage.read('workspaces/test/audio/one')).resolves.toMatchObject({ contentType: 'audio/m4a', bytes });
  });
});
