// Virenprüfung eingehender Dateien (Rechtsprüfung „Malware-Prüfung“, AVV § 5, Ole 18.11.2026): ClamAV als eigener
// Railway-Dienst (Image clamav/clamav, nur im privaten Netzwerk erreichbar), Abfrage über TCP mit dem clamd-Befehl
// INSTREAM. Geprüft wird nur die Signatur, es wird nichts ausgelesen oder gespeichert. Anleitung: docs/virenpruefung.md.
//
// Variablen:
//   CLAMAV_HOST               z. B. clamav.railway.internal (ohne Wert: Prüfung nicht eingerichtet)
//   CLAMAV_PORT               Standard 3310
//   CLAMAV_TIMEOUT_MS         Standard 30000
//   VIRENPRUEFUNG_PFLICHT=1   Ohne erreichbare Prüfung wird eine Datei abgelehnt. Ohne Schalter (Standard): Datei wird
//                             angenommen, aber als „ungeprüft“ markiert und erst nach erfolgreicher Prüfung zum Öffnen
//                             bzw. Herunterladen angeboten (Nachprüfung beim Öffnen und im Cron); Hinweis an die Admins.
//
// Aufrufer: lib/policen/server.ts (Policen per WhatsApp), lib/lead-files.ts (Upload am Kontakt), lib/mail/eingang.ts und
// api/buyer/leads/[id]/mail-anhang (Anhänge von Antworten per E-Mail, Paket M2).

import net from "node:net";

export type VirenKonfig = { host: string; port: number; timeoutMs: number };
export type VirenStatus = "sauber" | "befund" | "ungeprueft";
export type VirenErgebnis =
  | { status: "sauber" }
  | { status: "befund"; signatur: string }
  | { status: "ungeprueft"; grund: "nicht_eingerichtet" | "fehler" | "zu_gross"; detail?: string };
/** annehmen: sauber · ungeprueft: annehmen, aber nicht anbieten · verwerfen: Befund · ablehnen: Pflicht ohne Prüfung */
export type VirenEntscheidung = "annehmen" | "ungeprueft" | "verwerfen" | "ablehnen";

const an = (v: string | undefined) => /^(1|true|ja|an|on)$/i.test((v ?? "").trim());

/** Konfiguration aus der Umgebung; null = nicht eingerichtet. */
export function virenKonfig(env: Record<string, string | undefined> = process.env): VirenKonfig | null {
  const host = (env.CLAMAV_HOST ?? "").trim();
  if (!host) return null;
  const port = Number(env.CLAMAV_PORT ?? 3310);
  const timeoutMs = Number(env.CLAMAV_TIMEOUT_MS ?? 30_000);
  return { host, port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 3310, timeoutMs: timeoutMs > 0 ? timeoutMs : 30_000 };
}

/** VIRENPRUEFUNG_PFLICHT: ohne Prüfung keine Datei annehmen. */
export const virenPflicht = (env: Record<string, string | undefined> = process.env) => an(env.VIRENPRUEFUNG_PFLICHT);

/** Was mit der Datei passiert (rein, getestet). */
export function entscheide(e: VirenErgebnis, pflicht = virenPflicht()): VirenEntscheidung {
  if (e.status === "sauber") return "annehmen";
  if (e.status === "befund") return "verwerfen";
  return pflicht ? "ablehnen" : "ungeprueft";
}

const CHUNK = 64 * 1024;

/** Antwort von clamd auswerten (rein, getestet): „stream: OK“, „stream: <Name> FOUND“, sonst Fehler. */
export function werteAntwortAus(antwort: string): VirenErgebnis {
  const t = antwort.replace(/\0/g, "").trim();
  if (/:\s*OK$/.test(t)) return { status: "sauber" };
  const f = t.match(/:\s*(.+?)\s+FOUND$/);
  if (f) return { status: "befund", signatur: f[1].slice(0, 120) };
  if (/size limit exceeded/i.test(t)) return { status: "ungeprueft", grund: "zu_gross" };
  return { status: "ungeprueft", grund: "fehler", detail: t.slice(0, 120) || "leer" };
}

/** Rohbefehl an clamd (z-Form mit NUL-Ende); gibt die Antwort zurück. */
function clamd(k: VirenKonfig, schreibe: (s: net.Socket) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const s = net.createConnection({ host: k.host, port: k.port });
    const teile: Buffer[] = [];
    let fertig = false;
    const ende = (fn: () => void) => {
      if (fertig) return;
      fertig = true;
      s.destroy();
      fn();
    };
    s.setTimeout(k.timeoutMs, () => ende(() => reject(new Error("zeitueberschreitung"))));
    s.on("error", (e) => ende(() => reject(e)));
    s.on("data", (d) => {
      teile.push(d);
      if (d.includes(0)) ende(() => resolve(Buffer.concat(teile).toString("utf8")));
    });
    s.on("end", () => ende(() => resolve(Buffer.concat(teile).toString("utf8"))));
    s.on("connect", () => schreibe(s));
  });
}

/** Datei mit clamd INSTREAM prüfen. Ohne Konfiguration bzw. bei Fehlern: „ungeprueft“ (nie eine Ausnahme). */
export async function pruefeAufViren(data: Uint8Array, k: VirenKonfig | null = virenKonfig()): Promise<VirenErgebnis> {
  if (!k) return { status: "ungeprueft", grund: "nicht_eingerichtet" };
  try {
    const antwort = await clamd(k, (s) => {
      s.write("zINSTREAM\0");
      const b = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
      for (let i = 0; i < b.length; i += CHUNK) {
        const teil = b.subarray(i, i + CHUNK);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(teil.length);
        s.write(len);
        s.write(teil);
      }
      s.write(Buffer.alloc(4));
    });
    const e = werteAntwortAus(antwort);
    // Keine Inhalte und keine Dateinamen ins Log (A7), nur das Ergebnis
    if (e.status === "ungeprueft") console.error(`[virenpruefung] ${e.grund}`);
    return e;
  } catch (err) {
    console.error("[virenpruefung] nicht erreichbar", err instanceof Error ? err.message.slice(0, 80) : "fehler");
    return { status: "ungeprueft", grund: "fehler", detail: err instanceof Error ? err.message.slice(0, 80) : "fehler" };
  }
}

/** Erreichbarkeit (clamd PING → PONG), für Status und Diagnose. */
export async function virenpruefungErreichbar(k: VirenKonfig | null = virenKonfig()): Promise<boolean> {
  if (!k) return false;
  try {
    return /PONG/.test(await clamd({ ...k, timeoutMs: Math.min(k.timeoutMs, 5000) }, (s) => s.write("zPING\0")));
  } catch {
    return false;
  }
}

const TAG_MS = 24 * 60 * 60 * 1000;

/**
 * Hinweis an die Admins, dass Dateien ungeprüft angenommen wurden (Push höchstens einmal am Tag, Änderungsprotokoll).
 * Ohne Inhalte, ohne Dateinamen.
 */
export async function meldeUngeprueft(quelle: "policen" | "upload" | "mail", grund: string, now = new Date()): Promise<void> {
  try {
    const { prisma } = await import("@/lib/prisma");
    const { audit } = await import("@/lib/audit");
    const schon = await prisma.auditLog.findFirst({ where: { action: "viren.ungeprueft_hinweis", at: { gt: new Date(now.getTime() - TAG_MS) } }, select: { id: true } });
    if (schon) return;
    await audit("viren.ungeprueft_hinweis", { entity: "System", entityId: quelle, details: { quelle, grund }, actor: { role: "system" } });
    const { sendToAdmins } = await import("@/lib/push");
    await sendToAdmins({
      title: "Virenprüfung fehlt",
      body:
        grund === "nicht_eingerichtet"
          ? "Dateien werden ungeprüft angenommen und erst nach der Prüfung angeboten. Bitte den ClamAV-Dienst einrichten (docs/virenpruefung.md)."
          : "Der ClamAV-Dienst antwortet nicht. Dateien werden ungeprüft angenommen und erst nach der Prüfung angeboten.",
      url: "/admin/neu",
      tag: "virenpruefung-fehlt",
    });
  } catch {
    console.error("[virenpruefung] Hinweis an Admins fehlgeschlagen");
  }
}
