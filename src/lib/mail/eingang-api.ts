// Resend Receiving (Paket M2, lib/mail/eingang.ts): empfangene Mail, Anhänge mit frischer Download-Adresse (1 h gültig)
// und Datei laden. Eigene Datei, damit Tests sie ersetzen können. Keine Inhalte in Logs.
//   GET /emails/receiving/{id}                 Text, HTML, Kopfzeilen, authentication (spf, dkim, dmarc), raw.download_url
//   GET /emails/receiving/{id}/attachments     Liste mit download_url und expires_at
//   GET /emails/receiving/{id}/attachments/{a} ein Anhang mit frischer download_url

import { Resend } from "resend";

export type AuthErgebnis = { spf?: string | null; dkim?: string | null; dmarc?: string | null } | null;

export type EmpfangeneMail = {
  id: string;
  from: string;
  to: string[];
  subject: string;
  text: string | null;
  html: string | null;
  /** Kopfzeilen, Namen klein */
  headers: Record<string, string>;
  authentication: AuthErgebnis;
  /** Download der Rohmail (MIME, signiert, kurz gültig), z. B. für Kalenderteile (lib/calendar/termin-weiterleitung.ts) */
  rawUrl?: string | null;
};

export type EmpfangenerAnhang = {
  id: string;
  filename: string | null;
  size: number;
  contentType: string;
  inline: boolean;
  downloadUrl: string | null;
};

const kopf = (h: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!h || typeof h !== "object") return out;
  for (const [k, v] of Object.entries(h as Record<string, unknown>)) out[k.toLowerCase()] = Array.isArray(v) ? v.map(String).join(", ") : String(v ?? "");
  return out;
};

const anhang = (a: { id: string; filename?: string | null; size?: number; content_type?: string; content_disposition?: string | null; download_url?: string }): EmpfangenerAnhang => ({
  id: a.id,
  filename: a.filename ?? null,
  size: typeof a.size === "number" ? a.size : 0,
  contentType: a.content_type ?? "application/octet-stream",
  inline: a.content_disposition === "inline",
  downloadUrl: a.download_url ?? null,
});

export function eingangApi(apiKey: string) {
  const r = new Resend(apiKey);
  return {
    async mail(id: string): Promise<EmpfangeneMail> {
      const res = await r.emails.receiving.get(id);
      if (res.error || !res.data) throw new Error(`resend_receiving_get:${res.error?.name ?? "leer"}`);
      const d = res.data as typeof res.data & { authentication?: AuthErgebnis };
      return {
        id: d.id,
        from: d.from ?? "",
        to: d.to ?? [],
        subject: d.subject ?? "",
        text: d.text ?? null,
        html: d.html ?? null,
        headers: kopf(d.headers),
        authentication: d.authentication ?? null,
        rawUrl: d.raw?.download_url ?? null,
      };
    },
    async anhaenge(emailId: string): Promise<EmpfangenerAnhang[]> {
      const out: EmpfangenerAnhang[] = [];
      let after: string | undefined;
      for (let seite = 0; seite < 10; seite++) {
        const res = await r.emails.receiving.attachments.list({ emailId, limit: 100, ...(after ? { after } : {}) });
        if (res.error || !res.data) throw new Error(`resend_receiving_attachments:${res.error?.name ?? "leer"}`);
        out.push(...res.data.data.map(anhang));
        if (!res.data.has_more || !res.data.data.length) break;
        after = res.data.data[res.data.data.length - 1].id;
      }
      return out;
    },
    async anhang(emailId: string, id: string): Promise<EmpfangenerAnhang | null> {
      const res = await r.emails.receiving.attachments.get({ emailId, id });
      if (res.error || !res.data) return null;
      return anhang(res.data);
    },
    /** Datei von der (signierten, 1 h gültigen) Download-Adresse laden. */
    async datei(url: string, maxBytes: number): Promise<Buffer> {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`anhang_download:${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > maxBytes) throw new Error("anhang_zu_gross");
      return buf;
    },
  };
}

export type EingangApi = ReturnType<typeof eingangApi>;
