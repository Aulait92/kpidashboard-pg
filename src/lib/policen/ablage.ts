// Ablage der Policen vom Kunden (Rechtsprüfung A6, Ole 18.11.2026): eigener privater Bucket nur für Policen,
// Rechtsraum EU fest, Inhalt mit einem Schlüssel je Mandant verschlüsselt, Abruf nur über kurzlebige signierte Links
// nach dem Login. NICHT lib/r2.ts (Werbebilder, region auto, öffentliche URL).
//
// Railway-Variablen (alle nötig, sonst ist die Ablage aus und die Policen-Bitte geht nicht raus):
//   POLICEN_S3_ENDPOINT          z. B. https://<account-id>.eu.r2.cloudflarestorage.com (R2 mit EU-Jurisdiktion)
//                                oder https://s3.eu-central-1.amazonaws.com; andere Endpunkte werden abgelehnt
//   POLICEN_S3_BUCKET            z. B. pg-policen-eu (privat, kein öffentlicher Zugriff, keine eigene Domain)
//   POLICEN_S3_ACCESS_KEY_ID, POLICEN_S3_SECRET_ACCESS_KEY  Token nur für diesen Bucket (Objekt lesen/schreiben)
//   POLICEN_SCHLUESSEL           32 Byte, Base64 (openssl rand -base64 32); daraus je Mandant ein eigener Schlüssel
// Verschlüsselung: AES-256-GCM je Datei, Schlüssel je Mandant per HKDF-SHA256 aus POLICEN_SCHLUESSEL und der
// Kunden-ID, Objektname als zusätzliche Authentifizierung (eine Datei lässt sich keinem anderen Mandanten unterschieben).
// Zusätzlich verschlüsselt der Anbieter ruhende Daten selbst. Objektnamen ohne Dateinamen: policen/<Kunde>/<Lead>/<Zufall>.

import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export type AblageKonfig = { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string; region: string; schluessel: Buffer };

/** EU-Endpunkte: Cloudflare R2 mit EU-Jurisdiktion bzw. Amazon S3 in einer eu-Region. */
export function euEndpunkt(endpoint: string): { ok: boolean; region: string } {
  let host = "";
  try {
    const u = new URL(endpoint);
    if (u.protocol !== "https:") return { ok: false, region: "" };
    host = u.hostname.toLowerCase();
  } catch {
    return { ok: false, region: "" };
  }
  if (/^[a-z0-9]+\.eu\.r2\.cloudflarestorage\.com$/.test(host)) return { ok: true, region: "auto" };
  const aws = host.match(/^s3[.-](eu-[a-z]+-\d)\.amazonaws\.com$/);
  if (aws) return { ok: true, region: aws[1] };
  return { ok: false, region: "" };
}

/** Konfiguration, wenn vollständig und in der EU; sonst null (dann ist die Policen-Funktion aus). */
export function ablageKonfig(env: Record<string, string | undefined> = process.env): AblageKonfig | null {
  const endpoint = (env.POLICEN_S3_ENDPOINT ?? "").trim().replace(/\/$/, "");
  const bucket = (env.POLICEN_S3_BUCKET ?? "").trim();
  const accessKeyId = (env.POLICEN_S3_ACCESS_KEY_ID ?? "").trim();
  const secretAccessKey = (env.POLICEN_S3_SECRET_ACCESS_KEY ?? "").trim();
  const roh = (env.POLICEN_SCHLUESSEL ?? "").trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || !roh) return null;
  const eu = euEndpunkt(endpoint);
  if (!eu.ok) return null;
  const schluessel = Buffer.from(roh, "base64");
  if (schluessel.length !== 32) return null;
  return { endpoint, bucket, accessKeyId, secretAccessKey, region: eu.region, schluessel };
}

// ─── Verschlüsselung je Mandant ─────────────────────────────────────────────

const VERSION = 1;

function mandantenSchluessel(master: Buffer, customerId: string): Buffer {
  return Buffer.from(hkdfSync("sha256", master, Buffer.from("policen-ablage-v1"), Buffer.from(`kunde:${customerId}`), 32));
}

export function verschluessele(master: Buffer, customerId: string, key: string, data: Uint8Array): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", mandantenSchluessel(master, customerId), iv);
  c.setAAD(Buffer.from(key));
  const ct = Buffer.concat([c.update(data), c.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, c.getAuthTag(), ct]);
}

export function entschluessele(master: Buffer, customerId: string, key: string, payload: Uint8Array): Buffer {
  const b = Buffer.from(payload);
  if (b.length < 29 || b[0] !== VERSION) throw new Error("Ungültiges Format der Ablage.");
  const d = createDecipheriv("aes-256-gcm", mandantenSchluessel(master, customerId), b.subarray(1, 13));
  d.setAAD(Buffer.from(key));
  d.setAuthTag(b.subarray(13, 29));
  return Buffer.concat([d.update(b.subarray(29)), d.final()]);
}

// ─── Speicher (S3-kompatibel; in Tests austauschbar) ────────────────────────

export type Speicher = {
  put(key: string, body: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  del(keys: string[]): Promise<void>;
  /** Objekte unter einem Präfix mit Änderungszeit (für den Abgleich verwaister Dateien). */
  list(prefix: string): Promise<{ key: string; at: Date }[]>;
};

let testSpeicher: Speicher | null = null;
/** Nur für Tests: Speicher ersetzen (null = wieder S3). */
export function setzeSpeicherFuerTests(s: Speicher | null) {
  testSpeicher = s;
}

let s3Cache: { k: AblageKonfig; s: Speicher } | null = null;

async function s3Speicher(k: AblageKonfig): Promise<Speicher> {
  if (s3Cache?.k === k) return s3Cache.s;
  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } = await import("@aws-sdk/client-s3");
  const client = new S3Client({ region: k.region, endpoint: k.endpoint, credentials: { accessKeyId: k.accessKeyId, secretAccessKey: k.secretAccessKey } });
  const s: Speicher = {
    async put(key, body) {
      await client.send(new PutObjectCommand({ Bucket: k.bucket, Key: key, Body: body, ContentType: "application/octet-stream" }));
    },
    async get(key) {
      try {
        const r = await client.send(new GetObjectCommand({ Bucket: k.bucket, Key: key }));
        return r.Body ? Buffer.from(await r.Body.transformToByteArray()) : null;
      } catch (e) {
        if ((e as { name?: string })?.name === "NoSuchKey") return null;
        throw e;
      }
    },
    async del(keys) {
      for (let i = 0; i < keys.length; i += 1000) {
        await client.send(new DeleteObjectsCommand({ Bucket: k.bucket, Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true } }));
      }
    },
    async list(prefix) {
      const out: { key: string; at: Date }[] = [];
      let token: string | undefined;
      do {
        const r = await client.send(new ListObjectsV2Command({ Bucket: k.bucket, Prefix: prefix, ContinuationToken: token }));
        for (const o of r.Contents ?? []) if (o.Key) out.push({ key: o.Key, at: o.LastModified ?? new Date(0) });
        token = r.IsTruncated ? r.NextContinuationToken : undefined;
      } while (token && out.length < 100_000);
      return out;
    },
  };
  s3Cache = { k, s };
  return s;
}

function konfigOderFehler(): AblageKonfig {
  const k = ablageKonfig();
  if (!k) throw new Error("Policen-Ablage nicht eingerichtet.");
  return k;
}

const speicher = async (k: AblageKonfig) => testSpeicher ?? s3Speicher(k);

/** Ablage eingerichtet (Variablen vollständig, EU-Endpunkt)? */
export const ablageBereit = () => ablageKonfig() !== null;

export const PRAEFIX = "policen/";
const sauber = (x: string) => x.replace(/[^A-Za-z0-9_-]/g, "");

/** Datei verschlüsselt ablegen; gibt den Objektnamen zurück (ohne Dateinamen). */
export async function legeAb(customerId: string, leadId: string, data: Uint8Array): Promise<string> {
  const k = konfigOderFehler();
  const key = `${PRAEFIX}${sauber(customerId)}/${sauber(leadId)}/${randomUUID()}`;
  await (await speicher(k)).put(key, verschluessele(k.schluessel, customerId, key, data));
  return key;
}

/** Datei laden und entschlüsseln; null = nicht da. */
export async function holeAb(customerId: string, key: string): Promise<Buffer | null> {
  const k = konfigOderFehler();
  const roh = await (await speicher(k)).get(key);
  return roh ? entschluessele(k.schluessel, customerId, key, roh) : null;
}

/** Dateien löschen (fehlende Konfiguration: nichts zu tun). */
export async function loescheAb(keys: (string | null | undefined)[]): Promise<void> {
  const list = keys.filter((x): x is string => !!x && x.startsWith(PRAEFIX));
  const k = ablageKonfig();
  if (!list.length || !k) return;
  await (await speicher(k)).del(list);
}

/** Alle Objekte im Bucket (Abgleich verwaister Dateien im täglichen Cron). */
export async function listeAb(): Promise<{ key: string; at: Date }[]> {
  const k = ablageKonfig();
  return k ? (await speicher(k)).list(PRAEFIX) : [];
}

// ─── Kurzlebige signierte Links (nach dem Login) ────────────────────────────

export const LINK_SEKUNDEN = 120;

function linkSchluessel(): Buffer {
  const k = ablageKonfig();
  const basis = k?.schluessel ?? Buffer.from(process.env.AUTH_SECRET ?? "", "utf8");
  if (!basis.length) throw new Error("Kein Schlüssel für Links.");
  return Buffer.from(hkdfSync("sha256", basis, Buffer.from("policen-link-v1"), Buffer.from("link"), 32));
}

export type LinkDaten = { leadId: string; docId: string; userId: string; download: boolean; exp: number };

/** Signierter Link-Token (HMAC-SHA256), gilt LINK_SEKUNDEN und nur für diesen Login. */
export function signiereLink(d: Omit<LinkDaten, "exp">, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...d, exp: Math.floor(now / 1000) + LINK_SEKUNDEN })).toString("base64url");
  const sig = createHmac("sha256", linkSchluessel()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** Token prüfen (Signatur, Ablauf); null = ungültig oder abgelaufen. */
export function pruefeLink(token: string, now = Date.now()): LinkDaten | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const soll = createHmac("sha256", linkSchluessel()).update(body).digest();
  const ist = Buffer.from(sig, "base64url");
  if (ist.length !== soll.length || !timingSafeEqual(ist, soll)) return null;
  try {
    const d = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as LinkDaten;
    if (typeof d.exp !== "number" || d.exp * 1000 < now) return null;
    if (typeof d.leadId !== "string" || typeof d.docId !== "string" || typeof d.userId !== "string") return null;
    return { leadId: d.leadId, docId: d.docId, userId: d.userId, download: !!d.download, exp: d.exp };
  } catch {
    return null;
  }
}
