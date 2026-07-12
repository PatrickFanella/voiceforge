import { createHmac, timingSafeEqual } from 'node:crypto';

export class InvalidCursorError extends Error {}

export function encodeCursor(workspaceId: string, sequence: number, secret: string): string {
  const body = Buffer.from(JSON.stringify({ workspaceId, sequence })).toString('base64url');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function decodeCursor(cursor: string | undefined, workspaceId: string, secret: string): number {
  if (!cursor) return 0;
  const [body, provided] = cursor.split('.');
  if (!body || !provided) throw new InvalidCursorError('Cursor is malformed.');
  const expected = createHmac('sha256', secret).update(body).digest();
  let actual: Buffer;
  try { actual = Buffer.from(provided, 'base64url'); } catch { throw new InvalidCursorError('Cursor is malformed.'); }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new InvalidCursorError('Cursor signature is invalid.');
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { workspaceId?: unknown; sequence?: unknown };
    if (payload.workspaceId !== workspaceId || !Number.isSafeInteger(payload.sequence) || Number(payload.sequence) < 0) {
      throw new InvalidCursorError('Cursor does not belong to this workspace.');
    }
    return Number(payload.sequence);
  } catch (error) {
    if (error instanceof InvalidCursorError) throw error;
    throw new InvalidCursorError('Cursor payload is invalid.');
  }
}
