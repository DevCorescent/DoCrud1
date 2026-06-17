import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

let _client: S3Client | null | undefined = undefined;

function getClient(): S3Client | null {
  if (_client !== undefined) return _client;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    _client = null;
    return null;
  }
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _client;
}

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_PUBLIC_URL,
  );
}

/**
 * Upload a buffer to R2 and return the public URL.
 * Key should include the prefix path, e.g. "profiles/avatar_abc.jpg"
 */
export async function uploadToR2(key: string, body: Buffer, contentType: string): Promise<string> {
  const client = getClient();
  if (!client) throw new Error('R2 is not configured');
  await client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
  const base = process.env.R2_PUBLIC_URL!.replace(/\/$/, '');
  return `${base}/${key}`;
}

/** Delete an object from R2 by key. Non-fatal — ignores errors. */
export async function deleteFromR2(key: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    await client.send(new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
    }));
  } catch { /* non-fatal */ }
}

/** Extract the R2 key from a full public URL. Returns null if the URL is not from R2. */
export function r2KeyFromUrl(url: string): string | null {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, '');
  if (!base || !url.startsWith(`${base}/`)) return null;
  return url.slice(base.length + 1);
}

/** Returns true if the string looks like an external storage URL (not a base64 data URL). */
export function isStorageUrl(value: string): boolean {
  return value.startsWith('https://') || value.startsWith('http://');
}
