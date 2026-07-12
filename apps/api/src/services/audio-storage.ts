import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export class S3AudioStorage {
  constructor(private readonly client: S3Client, private readonly bucket: string, private readonly encryption: 'AES256' | null = 'AES256') {}

  async signUpload(input: { key: string; contentType: string; bytes: number; expiresInSeconds: number }) {
    const command = new PutObjectCommand({
      Bucket: this.bucket, Key: input.key, ContentType: input.contentType, ContentLength: input.bytes,
      ...(this.encryption ? { ServerSideEncryption: this.encryption } : {}), Metadata: { 'voiceforge-upload': 'audio' },
    });
    return getSignedUrl(this.client, command, { expiresIn: input.expiresInSeconds });
  }

  requiredUploadHeaders(contentType: string, bytes: number): Record<string, string> {
    return {
      'content-type': contentType, 'content-length': String(bytes),
      ...(this.encryption ? { 'x-amz-server-side-encryption': this.encryption } : {}),
    };
  }

  async verifyUpload(input: { key: string; contentType: string; bytes: number }) {
    const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: input.key }));
    if (head.ContentLength !== input.bytes) throw new AudioUploadValidationError('Uploaded audio size does not match the declaration.');
    if (head.ContentType !== input.contentType) throw new AudioUploadValidationError('Uploaded audio type does not match the declaration.');
  }

  async read(key: string) {
    const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!object.Body) throw new AudioUploadValidationError('Uploaded audio is empty.');
    return { bytes: await object.Body.transformToByteArray(), contentType: object.ContentType ?? 'application/octet-stream' };
  }
}

export class AudioUploadValidationError extends Error {}
