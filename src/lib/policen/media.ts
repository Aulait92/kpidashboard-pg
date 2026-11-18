// Eingehende WhatsApp-Medien bei 360dialog laden (Cloud API, Ole 17.11.2026).
// 1. GET {BASE}/{media_id} mit D360-API-KEY → { url, mime_type, file_size }
// 2. Die Meta-Adresse (lookaside.fbsbx.com) über 360dialog abrufen: Host durch {BASE} ersetzen, Pfad und Query
//    bleiben (360dialog-Doku „Media: Download“). Die Datei bleibt nur im Speicher, bis sie verschlüsselt ist.
// 3. Danach (bzw. wenn sie verworfen wird) DELETE {BASE}/{media_id} (Cloud API „Delete Media“, Ole 18.11.2026), damit
//    die Datei bei Meta nicht länger als nötig liegt. Ob Meta eingehende Medien darauf sofort löscht, ist nicht
//    zugesichert; sonst gilt Metas eigene Frist (bis 30 Tage). Fehler stören den Ablauf nicht.
// Hier gibt es keine KI: Die Datei geht nur an den Aufrufer (lib/policen/server.ts), der sie verschlüsselt speichert.

const BASE_URL = () => (process.env.DIALOG360_BASE_URL ?? "https://waba-v2.360dialog.io").replace(/\/$/, "");

export type MediaErgebnis = { ok: true; data: Buffer; mime: string | null } | { ok: false; grund: "zu_gross" | "fehler"; detail?: string };

/** Adresse für den Download über 360dialog (rein, getestet). */
export function downloadUrl(metaUrl: string, base = BASE_URL()): string {
  const u = new URL(metaUrl);
  return `${base}${u.pathname}${u.search}`;
}

export async function ladeMedia(apiKey: string, mediaId: string, maxBytes: number): Promise<MediaErgebnis> {
  try {
    const headers = { "D360-API-KEY": apiKey };
    const info = await fetch(`${BASE_URL()}/${encodeURIComponent(mediaId)}`, { headers });
    if (!info.ok) return { ok: false, grund: "fehler", detail: `info ${info.status}` };
    const j = (await info.json()) as { url?: string; mime_type?: string; file_size?: number | string };
    if (Number(j.file_size) > maxBytes) return { ok: false, grund: "zu_gross" };
    if (!j.url) return { ok: false, grund: "fehler", detail: "ohne url" };
    const res = await fetch(downloadUrl(j.url), { headers });
    if (!res.ok) return { ok: false, grund: "fehler", detail: `download ${res.status}` };
    if (Number(res.headers.get("content-length")) > maxBytes) return { ok: false, grund: "zu_gross" };
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length > maxBytes) return { ok: false, grund: "zu_gross" };
    if (!data.length) return { ok: false, grund: "fehler", detail: "leer" };
    return { ok: true, data, mime: j.mime_type ?? null };
  } catch (e) {
    return { ok: false, grund: "fehler", detail: e instanceof Error ? e.message.slice(0, 200) : String(e) };
  }
}

/** Datei bei 360dialog/Meta löschen (bestmöglich, Fehler werden nur gemeldet). true = Löschung bestätigt. */
export async function loescheMedia(apiKey: string, mediaId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL()}/${encodeURIComponent(mediaId)}`, { method: "DELETE", headers: { "D360-API-KEY": apiKey } });
    return res.ok;
  } catch {
    return false;
  }
}
