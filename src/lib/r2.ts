import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// Cloudflare R2 ist S3-API-kompatibel. Wir laden Bilder hoch und geben
// die public URL zurück, die wir dann an Meta /adimages übermitteln.
let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKey = process.env.R2_ACCESS_KEY;
  const secretKey = process.env.R2_SECRET_KEY;
  if (!accountId || !accessKey || !secretKey) {
    throw new Error(
      "R2_ACCOUNT_ID, R2_ACCESS_KEY und R2_SECRET_KEY müssen gesetzt sein.",
    );
  }
  client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });
  return client;
}

export async function uploadImageToR2(opts: {
  buffer: Buffer;
  key: string; // Pfad im Bucket, z.B. "creatives/2026-05-16-abc.jpg"
  contentType?: string;
}): Promise<string> {
  const bucket = process.env.R2_BUCKET;
  const publicUrlBase = process.env.R2_PUBLIC_URL;
  if (!bucket || !publicUrlBase) {
    throw new Error("R2_BUCKET und R2_PUBLIC_URL müssen gesetzt sein.");
  }

  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: opts.key,
      Body: opts.buffer,
      ContentType: opts.contentType ?? "image/jpeg",
    }),
  );

  return `${publicUrlBase.replace(/\/$/, "")}/${opts.key}`;
}
