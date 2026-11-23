// Eigene Beleg-Ablage (Ole, 22.11.2026: ohne GetMyInvoices, möglichst wenig Handarbeit, lückenlos).
// Eingänge: Beleg-Adresse (Mail-Eingang, lib/belege/eingang.ts), Upload auf Geld › Kosten › Belege, Ops-Upload
// (/api/ops/belege). Ablauf je Datei: Typ prüfen → Doppel (gleicher Inhalt) überspringen → Virenprüfung → KI-Auslesung
// (lib/belege/auslesen.ts) → Beleg speichern. ZIP-Dateien werden entpackt. Danach ordnet belegeAbgleichen() zu.

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { liesBelegAus, type BelegDaten } from "./auslesen";
import { entpackeZipEinzeln, istZip } from "./zip";

export const BELEG_MAX_BYTES = 15 * 1024 * 1024;
export const ZIP_MAX_BYTES = 100 * 1024 * 1024;

/** MIME-Typ aus Inhalt und Dateiname (nur PDF und Bilder sind Belege). */
export function belegTyp(daten: Uint8Array, name: string | null): "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | null {
  const b = Buffer.from(daten.subarray(0, 12));
  if (b.subarray(0, 4).toString("latin1") === "%PDF") return "application/pdf";
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  void name;
  return null;
}

export type AblageErgebnis = { name: string; ergebnis: "neu" | "doppelt" | "kein_beleg" | "virus" | "fehler"; id?: string; daten?: BelegDaten | null };

const datum = (s: string | null) => (s ? new Date(`${s}T00:00:00Z`) : null);

/** Eine Datei (oder ein ZIP mit mehreren) ablegen. Ordnet nicht zu: danach belegeAbgleichen() aufrufen. */
export async function belegAblegen(o: { daten: Uint8Array; name: string | null; quelle: "mail" | "upload"; absender?: string | null; spaeter?: boolean }): Promise<AblageErgebnis[]> {
  const name = (o.name ?? "beleg").slice(0, 200);
  // ZIP-Pakete (z. B. alle Meta-Rechnungen eines Jahres) dürfen groß sein, einzelne Belege nicht
  if (o.daten.length > ZIP_MAX_BYTES) return [{ name, ergebnis: "fehler" }];
  if (istZip(o.daten)) {
    // Datei für Datei entpacken (große Meta-ZIPs), defekte Einträge überspringen
    const out: AblageErgebnis[] = [];
    try {
      for (const d of entpackeZipEinzeln(o.daten)) out.push(...(await belegAblegen({ daten: d.daten, name: d.name, quelle: o.quelle, absender: o.absender, spaeter: o.spaeter })));
    } catch {
      out.push({ name, ergebnis: "fehler" });
    }
    return out;
  }
  if (o.daten.length > BELEG_MAX_BYTES) return [{ name, ergebnis: "fehler" }];
  const mimeType = belegTyp(o.daten, name);
  if (!mimeType) return [{ name, ergebnis: "kein_beleg" }];
  const hash = crypto.createHash("sha256").update(o.daten).digest("hex");
  const vorhanden = await prisma.beleg.findUnique({ where: { hash }, select: { id: true } });
  if (vorhanden) return [{ name, ergebnis: "doppelt", id: vorhanden.id }];

  const { pruefeAufViren, entscheide } = await import("@/lib/sicherheit/virenpruefung");
  const viren = await pruefeAufViren(o.daten).catch(() => ({ status: "ungeprueft" as const, grund: "fehler" }));
  const entscheidung = entscheide(viren as Parameters<typeof entscheide>[0]);
  if (entscheidung === "verwerfen" || entscheidung === "ablehnen") return [{ name, ergebnis: "virus" }];

  // Große Uploads: erst nur speichern (schnell, kein Abbruch), auslesen danach im Hintergrund (belegeAuslesenOffen)
  if (o.spaeter) {
    const b = await prisma.beleg.create({
      data: { quelle: o.quelle, datei: Buffer.from(o.daten), mimeType, hash, dateiname: name, absender: o.absender?.slice(0, 200) ?? null, ausgelesen: "offen", ocrFertig: false, typ: "MISC", waehrung: "EUR" },
      select: { id: true },
    });
    return [{ name, ergebnis: "neu", id: b.id }];
  }
  const d = await liesBelegAus(o.daten, mimeType);
  // Gleicher Beleg schon da (z. B. aus GetMyInvoices oder doppelt weitergeleitet): gleiche Nummer, Anbieter und Betrag
  if (d?.nummer && d.brutto != null) {
    const gleich = await prisma.beleg.findFirst({
      where: { nummer: d.nummer, brutto: d.brutto, ...(d.firma ? { firma: { contains: d.firma.split(/\s+/)[0], mode: "insensitive" } } : {}) },
      select: { id: true, datei: false, hash: true },
    });
    if (gleich) {
      // Datei nachtragen, falls der vorhandene Eintrag (GetMyInvoices) noch keine eigene hat
      if (!gleich.hash) await prisma.beleg.update({ where: { id: gleich.id }, data: { datei: Buffer.from(o.daten), mimeType, hash, dateiname: name } }).catch(() => null);
      return [{ name, ergebnis: "doppelt", id: gleich.id, daten: d }];
    }
  }
  const b = await prisma.beleg.create({
    data: {
      quelle: o.quelle,
      datei: Buffer.from(o.daten),
      mimeType,
      hash,
      dateiname: name,
      absender: o.absender?.slice(0, 200) ?? null,
      ausgelesen: d ? "ki" : "fehler",
      ocrFertig: !!d,
      typ: d?.typ ?? "MISC",
      firma: d?.firma ?? null,
      nummer: d?.nummer ?? null,
      datum: datum(d?.datum ?? null),
      netto: d?.netto ?? null,
      ustSatz: d?.ustSatz ?? null,
      brutto: d?.brutto ?? null,
      waehrung: d?.waehrung ?? "EUR",
    },
    select: { id: true },
  });
  return [{ name, ergebnis: "neu", id: b.id, daten: d }];
}

/** Kurzfassung für Rückmeldungen. */
export function zaehle(e: AblageErgebnis[]): Record<AblageErgebnis["ergebnis"], number> {
  const z = { neu: 0, doppelt: 0, kein_beleg: 0, virus: 0, fehler: 0 };
  for (const x of e) z[x.ergebnis]++;
  return z;
}

/**
 * Mail ohne Beleg-Anhang (Rechnung steht im Mailtext, z. B. Apple, Airbnb): die Originalmail (.eml) ist der Beleg.
 * Auslesen aus dem Text. Nur ablegen, wenn die KI einen Betrag findet (sonst ist es kein Beleg, z. B. Werbung).
 */
export async function belegAusMail(o: { eml: Uint8Array | null; text: string; betreff: string; absender: string | null }): Promise<AblageErgebnis> {
  const name = `${o.betreff || "Mail"}.eml`.replace(/[\\/:*?"<>|]+/g, " ").slice(0, 200);
  // Zahlungsmitteilungen, die ausdrücklich keine Rechnung sind (z. B. Meta „This is not an invoice“): kein Beleg
  if (/this is not an invoice|keine rechnung|dies ist keine rechnung/i.test(`${o.betreff}\n${o.text}`)) return { name, ergebnis: "kein_beleg" };
  const text = `Betreff: ${o.betreff}\n\n${o.text}`;
  const d = await liesBelegAus(Buffer.from(text, "utf8"), "text/plain");
  if (!d || d.brutto == null || d.typ === "MISC") return { name, ergebnis: "kein_beleg", daten: d };
  const datei = o.eml && o.eml.length ? Buffer.from(o.eml) : Buffer.from(text, "utf8");
  const mimeType = o.eml && o.eml.length ? "message/rfc822" : "text/plain";
  if (d.nummer) {
    const gleich = await prisma.beleg.findFirst({ where: { nummer: d.nummer, brutto: d.brutto }, select: { id: true } });
    if (gleich) return { name, ergebnis: "doppelt", id: gleich.id, daten: d };
  }
  const hash = crypto.createHash("sha256").update(`${d.firma}|${d.nummer}|${d.datum}|${d.brutto}|${d.waehrung}|${o.text.slice(0, 2000)}`).digest("hex");
  const vorhanden = await prisma.beleg.findUnique({ where: { hash }, select: { id: true } });
  if (vorhanden) return { name, ergebnis: "doppelt", id: vorhanden.id, daten: d };
  const b = await prisma.beleg.create({
    data: {
      quelle: "mail",
      datei,
      mimeType,
      hash,
      dateiname: name,
      absender: o.absender?.slice(0, 200) ?? null,
      ausgelesen: "ki",
      ocrFertig: true,
      typ: d.typ,
      firma: d.firma,
      nummer: d.nummer,
      datum: datum(d.datum),
      netto: d.netto,
      ustSatz: d.ustSatz,
      brutto: d.brutto,
      waehrung: d.waehrung,
    },
    select: { id: true },
  });
  return { name, ergebnis: "neu", id: b.id, daten: d };
}

/**
 * Gespeicherte, noch nicht ausgelesene Belege (große Uploads) auslesen. Doppelte (gleiche Nummer, gleicher Betrag, gleicher
 * Anbieter wie ein vorhandener Beleg) werden entfernt. Läuft nach dem Upload im Hintergrund und alle 15 Minuten im Cron.
 */
export async function belegeAuslesenOffen(max = 200): Promise<{ ausgelesen: number; doppelt: number; fehler: number }> {
  const offen = await prisma.beleg.findMany({ where: { ausgelesen: "offen" }, select: { id: true, datei: true, mimeType: true }, orderBy: { createdAt: "asc" }, take: max });
  let ausgelesen = 0;
  let doppelt = 0;
  let fehler = 0;
  for (const b of offen) {
    // Gegen parallele Läufe: nur weiter, wenn dieser Lauf den Beleg „nimmt“
    const genommen = await prisma.beleg.updateMany({ where: { id: b.id, ausgelesen: "offen" }, data: { ausgelesen: "laeuft" } });
    if (!genommen.count) continue;
    const d = b.datei && b.mimeType ? await liesBelegAus(new Uint8Array(b.datei), b.mimeType).catch(() => null) : null;
    if (!d) {
      fehler++;
      await prisma.beleg.update({ where: { id: b.id }, data: { ausgelesen: "fehler", ocrFertig: false } });
      continue;
    }
    if (d.nummer && d.brutto != null) {
      const gleich = await prisma.beleg.findFirst({
        where: { id: { not: b.id }, nummer: d.nummer, brutto: d.brutto, ...(d.firma ? { firma: { contains: d.firma.split(/\s+/)[0], mode: "insensitive" } } : {}) },
        select: { id: true },
      });
      if (gleich) {
        doppelt++;
        await prisma.beleg.delete({ where: { id: b.id } });
        continue;
      }
    }
    await prisma.beleg.update({
      where: { id: b.id },
      data: { ausgelesen: "ki", ocrFertig: true, typ: d.typ, firma: d.firma, nummer: d.nummer, datum: datum(d.datum), netto: d.netto, ustSatz: d.ustSatz, brutto: d.brutto, waehrung: d.waehrung },
    });
    ausgelesen++;
  }
  // Hängengebliebene Läufe (Neustart mitten im Auslesen) nach einer Stunde wieder freigeben
  await prisma.beleg.updateMany({ where: { ausgelesen: "laeuft", updatedAt: { lt: new Date(Date.now() - 3_600_000) } }, data: { ausgelesen: "offen" } }).catch(() => null);
  return { ausgelesen, doppelt, fehler };
}
