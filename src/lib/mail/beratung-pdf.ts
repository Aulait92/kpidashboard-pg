// PDF „Beratungsdokumentation“ (Gesprächszusammenfassung mit Datum) für Mail-Anhang und Ablage unter Dokumente
// (Dokumentart „beratungsdoku“, lib/lead-files.ts). Inhalt: lib/mail/beratung.ts beratungsPdfInhalt.

import { prisma } from "@/lib/prisma";
import { beratungsPdfInhalt, pdfDateiname } from "@/lib/mail/beratung";
import { textPdf } from "@/lib/mail/text-pdf";

export type BeratungsPdf = { fileName: string; data: Uint8Array };

/** PDF erzeugen; Längen begrenzt wie im Dialog „E-Mail schreiben“. */
export async function beratungsPdf(f: Parameters<typeof beratungsPdfInhalt>[0]): Promise<BeratungsPdf> {
  const kurz = (v: string, n: number) => String(v ?? "").trim().slice(0, n);
  const inhalt = beratungsPdfInhalt({ ...f, produkt: kurz(f.produkt, 200) || "Versicherung", wuensche: kurz(f.wuensche, 6000), rat: kurz(f.rat, 6000) });
  return { fileName: pdfDateiname("Beratungsdokumentation", f.kunde, f.now), data: await textPdf({ ...inhalt, autor: f.berater || undefined }) };
}

/** Name des Beraters im PDF: Absendername des Postfachs, sonst der Anzeigename des Logins. */
export async function beraterName(userId: string | null | undefined, fallback = ""): Promise<string> {
  if (!userId) return fallback;
  const [conn, me] = await Promise.all([
    prisma.mailConnection.findUnique({ where: { userId }, select: { fromName: true } }).catch(() => null),
    prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } }).catch(() => null),
  ]);
  return conn?.fromName?.trim() || me?.displayName?.trim() || fallback;
}
