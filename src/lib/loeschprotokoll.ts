// Löschprotokoll (Ole, 18.11.2026, „Löschung inklusive Backups“): Datenbank-Sicherungen bei Railway lassen sich nicht
// einzeln bereinigen. Deshalb steht jede Löschung aus Datenschutzgründen hier (nur IDs und technische Verweise, keine
// Inhalte) und wird nach einer Wiederherstellung automatisch erneut angewendet:
//   - beim Start der App (instrumentation.ts) und täglich im Cron (api/whatsapp/cron, 03:00 UTC),
//   - Kopie jedes Eintrags im privaten Policen-Bucket (loeschprotokoll/<id>.json), damit auch Löschungen nach dem
//     Sicherungszeitpunkt zurückkommen, die in der wiederhergestellten Datenbank fehlen,
//   - ohne Bucket: scripts/loeschprotokoll.mjs überträgt die Einträge aus der alten in die neue Datenbank
//     (docs/notfall-wiederherstellung.md, Schritt „Löschprotokoll“).
// Erneut angewendet wird nur, was laut Datenbank (wieder) da ist: Lead nicht gelöscht, Kunde ohne dataDeletedAt,
// Policen-Eintrag vorhanden, ausgelesene Policen-Werte („ohne KI“, A9) vorhanden, Vertriebskontakt vorhanden. Im
// normalen Betrieb passiert also nichts.
// Zeitliche Löschfristen (Cron) brauchen das Protokoll nicht: Sie greifen nach einer Wiederherstellung von selbst.

import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export type LoeschArt = "lead" | "kunde" | "policen_dokument" | "policen_auszug" | "vertriebskontakt";
export type LoeschEintrag = { art: LoeschArt; entityId: string; customerId?: string | null; ref?: string | null; grund?: string | null };
type Zeile = LoeschEintrag & { id: string; createdAt: Date };

const ARTEN: LoeschArt[] = ["lead", "kunde", "policen_dokument", "policen_auszug", "vertriebskontakt"];
/** 13 Monate: länger als jede Datenbank-Sicherung (docs/datenschutz.md, Löschkonzept). */
export const PROTOKOLL_TAGE = 400;
const DAY = 24 * 60 * 60 * 1000;
const SYSTEM = { role: "system" } as const;

/** Löschungen festhalten: Datenbank und Kopie im Bucket (wenn eingerichtet). Wirft nie. */
export async function protokolliereLoeschung(eintraege: LoeschEintrag[], now = new Date()): Promise<void> {
  const liste = eintraege.filter((e) => e.entityId);
  if (!liste.length) return;
  try {
    const rows = await prisma.loeschprotokoll.createManyAndReturn({
      data: liste.map((e) => ({ art: e.art, entityId: e.entityId, customerId: e.customerId ?? null, ref: e.ref ?? null, grund: e.grund?.slice(0, 40) ?? null, createdAt: now })),
      skipDuplicates: true,
    });
    await spiegeln(rows as Zeile[]);
  } catch (e) {
    console.error("[loeschprotokoll] schreiben fehlgeschlagen", e instanceof Error ? e.name : "fehler");
  }
}

async function spiegeln(rows: Zeile[]): Promise<void> {
  if (!rows.length) return;
  try {
    const { legeProtokollAb } = await import("@/lib/policen/ablage");
    for (const r of rows) {
      const json = JSON.stringify({ id: r.id, art: r.art, entityId: r.entityId, customerId: r.customerId ?? null, ref: r.ref ?? null, grund: r.grund ?? null, createdAt: r.createdAt.toISOString() });
      if (!(await legeProtokollAb(r.id, json))) return;
    }
  } catch (e) {
    console.error("[loeschprotokoll] Kopie im Bucket fehlgeschlagen", e instanceof Error ? e.name : "fehler");
  }
}

/** Eine Kopie aus dem Bucket lesen (rein, getestet); null = unbrauchbar. */
export function leseKopie(json: string): Zeile | null {
  try {
    const d = JSON.parse(json) as Record<string, unknown>;
    if (typeof d.id !== "string" || typeof d.entityId !== "string" || !ARTEN.includes(d.art as LoeschArt)) return null;
    const at = new Date(String(d.createdAt));
    if (Number.isNaN(at.getTime())) return null;
    const s = (v: unknown) => (typeof v === "string" ? v : null);
    return { id: d.id, art: d.art as LoeschArt, entityId: d.entityId, customerId: s(d.customerId), ref: s(d.ref), grund: s(d.grund), createdAt: at };
  } catch {
    return null;
  }
}

/** Kopien aus dem Bucket übernehmen, die in der Datenbank fehlen (nach einer Wiederherstellung). */
async function uebernimmKopien(): Promise<number> {
  const { listeProtokoll, holeProtokoll } = await import("@/lib/policen/ablage");
  const objekte = await listeProtokoll();
  if (!objekte.length) return 0;
  const id = (key: string) => key.replace(/^.*\//, "").replace(/\.json$/, "");
  const bekannt = new Set<string>();
  for (let i = 0; i < objekte.length; i += 1000) {
    const ids = objekte.slice(i, i + 1000).map((o) => id(o.key));
    for (const r of await prisma.loeschprotokoll.findMany({ where: { id: { in: ids } }, select: { id: true } })) bekannt.add(r.id);
  }
  const fehlend = objekte.filter((o) => !bekannt.has(id(o.key)));
  let n = 0;
  for (const o of fehlend) {
    const z = leseKopie((await holeProtokoll(o.key)) ?? "");
    if (!z) continue;
    const r = await prisma.loeschprotokoll.createMany({ data: [{ ...z, customerId: z.customerId ?? null, ref: z.ref ?? null, grund: z.grund ?? null }], skipDuplicates: true });
    n += r.count;
  }
  return n;
}

export type Anwendung = { uebernommen: number; offen: { art: LoeschArt; entityId: string }[]; angewendet: number; fehler: number };

/**
 * Jede protokollierte Löschung erneut anwenden, deren Daten (wieder) in der Datenbank sind. nurPruefen: nur melden
 * (ohne Schreiben).
 * Wirft nicht; Fehler einzelner Einträge zählen in „fehler“.
 */
export async function wendeLoeschprotokollAn(opts: { nurPruefen?: boolean } = {}): Promise<Anwendung> {
  const out: Anwendung = { uebernommen: 0, offen: [], angewendet: 0, fehler: 0 };
  // nurPruefen: nur lesen (Diagnose), Kopien aus dem Bucket werden dann nicht übernommen
  if (!opts.nurPruefen) out.uebernommen = await uebernimmKopien().catch((e) => {
    console.error("[loeschprotokoll] Kopien nicht lesbar", e instanceof Error ? e.name : "fehler");
    return 0;
  });
  const zeilen = await prisma.loeschprotokoll.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, art: true, entityId: true, customerId: true, ref: true, grund: true, createdAt: true } });
  const nach = (art: LoeschArt) => zeilen.filter((z) => z.art === art).map((z) => z.entityId);
  const stueckweise = async <T,>(ids: string[], fn: (teil: string[]) => Promise<T[]>): Promise<T[]> => {
    const r: T[] = [];
    for (let i = 0; i < ids.length; i += 1000) r.push(...(await fn(ids.slice(i, i + 1000))));
    return r;
  };

  const leads = await stueckweise(nach("lead"), (ids) => prisma.lead.findMany({ where: { id: { in: ids }, erasedAt: null }, select: { id: true } }));
  const kunden = await stueckweise(nach("kunde"), (ids) => prisma.customer.findMany({ where: { id: { in: ids }, dataDeletedAt: null }, select: { id: true } }));
  const dokumente = await stueckweise(nach("policen_dokument"), (ids) => prisma.leadDocument.findMany({ where: { id: { in: ids } }, select: { id: true, storageKey: true } }));
  const auszuege = await stueckweise(nach("policen_auszug"), (ids) => prisma.policenAuszug.findMany({ where: { id: { in: ids } }, select: { id: true } }));
  const kontakte = await stueckweise(nach("vertriebskontakt"), (ids) => prisma.salesContact.findMany({ where: { id: { in: ids } }, select: { id: true } }));
  out.offen = [
    ...kunden.map((x) => ({ art: "kunde" as const, entityId: x.id })),
    ...leads.map((x) => ({ art: "lead" as const, entityId: x.id })),
    ...dokumente.map((x) => ({ art: "policen_dokument" as const, entityId: x.id })),
    ...auszuege.map((x) => ({ art: "policen_auszug" as const, entityId: x.id })),
    ...kontakte.map((x) => ({ art: "vertriebskontakt" as const, entityId: x.id })),
  ];
  if (opts.nurPruefen || !out.offen.length) return out;

  const versuche = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      out.angewendet++;
    } catch (e) {
      out.fehler++;
      console.error("[loeschprotokoll] anwenden fehlgeschlagen", e instanceof Error ? e.message.slice(0, 80) : "fehler");
    }
  };
  // Kunden zuerst (enthält ihre Leads und Policen), dann einzelne Leads, Dokumente, Kontakte
  if (kunden.length) {
    const { finalDeleteCustomer } = await import("@/lib/ruhend");
    for (const k of kunden) await versuche(() => finalDeleteCustomer(k.id, { actor: SYSTEM, reason: "Löschprotokoll nach Wiederherstellung", ausLoeschprotokoll: true }));
  }
  if (leads.length) {
    const { eraseLead } = await import("@/lib/erasure");
    const nochDa = new Set((await prisma.lead.findMany({ where: { id: { in: leads.map((l) => l.id) }, erasedAt: null }, select: { id: true } })).map((l) => l.id));
    for (const l of leads) if (nochDa.has(l.id)) await versuche(() => eraseLead(l.id, SYSTEM, { ausLoeschprotokoll: true }));
  }
  const docs = await prisma.leadDocument.findMany({ where: { id: { in: dokumente.map((d) => d.id) } }, select: { id: true, storageKey: true } });
  if (docs.length) {
    await versuche(async () => {
      const { loescheAb } = await import("@/lib/policen/ablage");
      await loescheAb(docs.map((d) => d.storageKey)).catch(() => null);
      await prisma.leadDocument.deleteMany({ where: { id: { in: docs.map((d) => d.id) } } });
    });
  }
  // Ausgelesene Werte nach „ohne KI“ (A9); mit einer gelöschten Unterlage sind sie ohnehin weg (Cascade)
  const auszugIds = (await prisma.policenAuszug.findMany({ where: { id: { in: auszuege.map((x) => x.id) } }, select: { id: true } })).map((x) => x.id);
  if (auszugIds.length) await versuche(() => prisma.policenAuszug.deleteMany({ where: { id: { in: auszugIds } } }));
  if (kontakte.length) await versuche(() => prisma.salesContact.deleteMany({ where: { id: { in: kontakte.map((k) => k.id) } } }));
  await audit("loeschprotokoll.angewendet", {
    entity: "System",
    entityId: "loeschprotokoll",
    details: { kunden: kunden.length, leads: leads.length, dokumente: docs.length, auszuege: auszugIds.length, kontakte: kontakte.length, uebernommen: out.uebernommen, fehler: out.fehler },
    actor: SYSTEM,
  });
  console.info(`[loeschprotokoll] erneut angewendet: kunden=${kunden.length} leads=${leads.length} dokumente=${docs.length} kontakte=${kontakte.length} fehler=${out.fehler}`);
  return out;
}

/** Einträge älter als 13 Monate löschen (Datenbank und Kopie), täglich im Cron. */
export async function pruneLoeschprotokoll(now = new Date()): Promise<number> {
  const grenze = new Date(now.getTime() - PROTOKOLL_TAGE * DAY);
  const alt = await prisma.loeschprotokoll.findMany({ where: { createdAt: { lt: grenze } }, select: { id: true } });
  if (!alt.length) return 0;
  const { loescheProtokoll, PROTOKOLL_PRAEFIX } = await import("@/lib/policen/ablage");
  await loescheProtokoll(alt.map((a) => `${PROTOKOLL_PRAEFIX}${a.id}.json`)).catch(() => null);
  return (await prisma.loeschprotokoll.deleteMany({ where: { id: { in: alt.map((a) => a.id) } } })).count;
}
