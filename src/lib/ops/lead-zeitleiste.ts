// Diagnose q=lead-zeitleiste&kunde=<id>[&tage=14] (Ole, 25.11.2026, Auswertung Kunde Lohmann): Was ist mit jedem Lead
// eines Kunden passiert, und wie schnell? Nur lesend und anonym: keine Namen, Nummern, Adressen oder Nachrichteninhalte,
// Leads als L1, L2 … (nach Eingang), Berater als B1, B2 … (nach Anzahl Leads), Zeiten in Berliner Zeit.
//
// Je Lead: Eingang, Produkt, erster Kontakt (Assistent oder Mensch, Minuten nach Eingang), Zustellfehler (Meta-Codes),
// erste Antwort des Leads, erste menschliche Reaktion auf eine Lead-Nachricht (Minuten, Berater), Anrufe (im Verlauf)
// und gezählte Anrufversuche, Status, erster Termin (gebucht über, wann, Beginn, Ergebnis), Angebot, nächste Aufgabe
// (Art, fällig, überfällig) und zuständiger Berater. Dazu Summen je Berater (Leads, Median Reaktionszeit, überfällige
// offene Aufgaben). Rein: zeitleisteAuswerten (Unit-Test tests/unit/lead-zeitleiste.test.ts).

import { prisma } from "@/lib/prisma";

const MIN = 60 * 1000;

export type ZlLead = {
  id: string;
  createdAt: Date;
  source: string | null;
  status: string | null;
  assignedUserId: string | null;
  callAttempts: number;
  reached: boolean;
  followUpAt: Date | null;
};
export type ZlNachricht = { leadId: string; direction: string; sentBy: string | null; sentByUserId: string | null; createdAt: Date; errorCode: number | null };
export type ZlAnruf = { leadId: string; userId: string | null; createdAt: Date };
export type ZlTermin = {
  leadId: string;
  createdAt: Date;
  startsAt: Date;
  status: string;
  attendance: string | null;
  bookedVia: string | null;
  angebotAbgelegtAt: Date | null;
  angebotGesendetAt: Date | null;
};
export type ZlAufgabe = { leadId: string; kind: string; dueAt: Date };
export type ZlNutzer = { id: string; teamRole: string };

const fmt = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d) : null;
const minuten = (von: Date, bis: Date) => Math.max(0, Math.round((bis.getTime() - von.getTime()) / MIN));
const mensch = (sentBy: string | null) => sentBy === "agent" || sentBy === "app";

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function terminErgebnis(t: ZlTermin, now: Date): string {
  if (t.status === "cancelled") return "abgesagt";
  if (t.status === "no_show" || t.attendance === "nicht_erschienen") return "nicht erschienen";
  if (t.status === "completed") return "Ergebnis erfasst";
  return t.startsAt.getTime() > now.getTime() ? "steht an" : "Ergebnis fehlt";
}

/** Zeitleiste je Lead und Summen je Berater (rein, anonym). */
export function zeitleisteAuswerten(d: { leads: ZlLead[]; nachrichten: ZlNachricht[]; anrufe: ZlAnruf[]; termine: ZlTermin[]; aufgaben: ZlAufgabe[]; nutzer: ZlNutzer[]; now: Date }) {
  const leads = [...d.leads].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  // Berater-Kürzel nach Anzahl zugeteilter Leads (dann Rolle, dann ID), danach alle übrigen Logins
  const zahl = new Map<string, number>();
  for (const l of leads) if (l.assignedUserId) zahl.set(l.assignedUserId, (zahl.get(l.assignedUserId) ?? 0) + 1);
  const nutzerIds = [...new Set([...d.nutzer.map((u) => u.id), ...zahl.keys()])];
  nutzerIds.sort((a, b) => (zahl.get(b) ?? 0) - (zahl.get(a) ?? 0) || a.localeCompare(b));
  const kuerzel = new Map(nutzerIds.map((id, i) => [id, `B${i + 1}`]));
  const rolle = new Map(d.nutzer.map((u) => [u.id, u.teamRole === "advisor" ? "Berater" : "Inhaber"]));
  const k = (id: string | null | undefined) => (id ? (kuerzel.get(id) ?? "unbekannt") : null);

  const gruppe = <T extends { leadId: string }>(xs: T[]) => {
    const m = new Map<string, T[]>();
    for (const x of xs) m.set(x.leadId, [...(m.get(x.leadId) ?? []), x]);
    return m;
  };
  const nachJe = gruppe(d.nachrichten);
  const anrufJe = gruppe(d.anrufe);
  const terminJe = gruppe(d.termine);
  const aufgabeJe = gruppe(d.aufgaben);
  const zeit = <T extends { createdAt: Date }>(xs: T[]) => [...xs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const reaktionen = new Map<string, number[]>();
  const ueberfaellig = new Map<string, number>();
  const zeilen = leads.map((l, i) => {
    const msgs = zeit(nachJe.get(l.id) ?? []);
    const calls = zeit(anrufJe.get(l.id) ?? []);
    const raus = msgs.filter((m) => m.direction === "outbound");
    const ersteRaus = raus[0] ?? null;
    const ersterAnruf = calls[0] ?? null;
    // Erster Kontakt: erste ausgehende Nachricht oder erster Anruf im Verlauf, was früher war
    let ersterKontakt: { wer: "Assistent" | "Mensch"; weg: "WhatsApp" | "Anruf"; minuten: number; berater: string | null } | null = null;
    if (ersteRaus && (!ersterAnruf || ersteRaus.createdAt <= ersterAnruf.createdAt)) {
      ersterKontakt = { wer: mensch(ersteRaus.sentBy) ? "Mensch" : "Assistent", weg: "WhatsApp", minuten: minuten(l.createdAt, ersteRaus.createdAt), berater: mensch(ersteRaus.sentBy) ? k(ersteRaus.sentByUserId) : null };
    } else if (ersterAnruf) {
      ersterKontakt = { wer: "Mensch", weg: "Anruf", minuten: minuten(l.createdAt, ersterAnruf.createdAt), berater: k(ersterAnruf.userId) };
    }
    const ersteAntwort = msgs.find((m) => m.direction === "inbound") ?? null;
    // Erste menschliche Reaktion nach der ersten Nachricht des Leads (WhatsApp vom Menschen oder Anruf)
    let reaktion: { minuten: number; weg: "WhatsApp" | "Anruf"; berater: string | null } | null = null;
    if (ersteAntwort) {
      const t0 = ersteAntwort.createdAt.getTime();
      const wa = raus.find((m) => mensch(m.sentBy) && m.createdAt.getTime() >= t0);
      const an = calls.find((c) => c.createdAt.getTime() >= t0);
      const erst = wa && (!an || wa.createdAt <= an.createdAt) ? { at: wa.createdAt, weg: "WhatsApp" as const, user: wa.sentByUserId } : an ? { at: an.createdAt, weg: "Anruf" as const, user: an.userId } : null;
      if (erst) {
        reaktion = { minuten: minuten(ersteAntwort.createdAt, erst.at), weg: erst.weg, berater: k(erst.user) };
        const wer = reaktion.berater ?? k(l.assignedUserId) ?? "unbekannt";
        reaktionen.set(wer, [...(reaktionen.get(wer) ?? []), reaktion.minuten]);
      }
    }
    const termine = zeit(terminJe.get(l.id) ?? []);
    const t = termine[0] ?? null;
    const angebotAbgelegt = termine.find((x) => x.angebotAbgelegtAt)?.angebotAbgelegtAt ?? null;
    const angebotGesendet = termine.find((x) => x.angebotGesendetAt)?.angebotGesendetAt ?? null;
    // Nächste Aufgabe: Wiedervorlage bzw. aktive Aufgabe, die früheste zuerst (nur Art und Zeit, keine Notiz)
    const offen = [...(l.followUpAt ? [{ art: "Wiedervorlage", dueAt: l.followUpAt }] : []), ...(aufgabeJe.get(l.id) ?? []).map((a) => ({ art: a.kind, dueAt: a.dueAt }))].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
    const nUeber = offen.filter((o) => o.dueAt.getTime() < d.now.getTime()).length;
    const berater = k(l.assignedUserId) ?? "ohne";
    if (nUeber) ueberfaellig.set(berater, (ueberfaellig.get(berater) ?? 0) + nUeber);
    return {
      lead: `L${i + 1}`,
      eingang: fmt(l.createdAt),
      produkt: l.source ?? null,
      ersterKontakt,
      zustellfehler: [...new Set(raus.map((m) => m.errorCode).filter((c): c is number => c != null))],
      ersteAntwortLead: ersteAntwort ? { am: fmt(ersteAntwort.createdAt), minutenNachEingang: minuten(l.createdAt, ersteAntwort.createdAt) } : null,
      ersteMenschlicheReaktion: reaktion,
      anrufe: { imVerlauf: calls.length, gezaehlteVersuche: l.callAttempts, erreicht: l.reached },
      status: l.status ?? "neu",
      termin: t
        ? { gebuchtUeber: t.bookedVia ?? "unbekannt", gebuchtAm: fmt(t.createdAt), minutenNachEingang: minuten(l.createdAt, t.createdAt), beginn: fmt(t.startsAt), ergebnis: terminErgebnis(t, d.now), weitere: termine.length - 1 }
        : null,
      angebot: angebotAbgelegt || angebotGesendet || /angebot/i.test(l.status ?? "") ? { abgelegt: fmt(angebotAbgelegt), gesendet: fmt(angebotGesendet) } : null,
      naechsteAufgabe: offen[0] ? { art: offen[0].art, faellig: fmt(offen[0].dueAt), ueberfaellig: offen[0].dueAt.getTime() < d.now.getTime() } : null,
      berater,
    };
  });

  const beraterListe = [...new Set([...zeilen.map((z) => z.berater), ...reaktionen.keys()])].sort();
  const jeBerater = beraterListe.map((b) => {
    const id = [...kuerzel.entries()].find(([, v]) => v === b)?.[0];
    return {
      berater: b,
      rolle: id ? (rolle.get(id) ?? "unbekannt") : null,
      leads: zeilen.filter((z) => z.berater === b).length,
      reaktionen: reaktionen.get(b)?.length ?? 0,
      medianReaktionMin: median(reaktionen.get(b) ?? []),
      offeneAufgabenUeberfaellig: ueberfaellig.get(b) ?? 0,
    };
  });
  return { leads: zeilen, jeBerater };
}

/** Diagnose-Abfrage: Daten laden (nur lesend) und anonym auswerten. */
export async function leadZeitleisteDiagnose(p: URLSearchParams, now = new Date()) {
  const kunde = (p.get("kunde") ?? "").trim();
  if (!kunde) return { fehler: "kunde=<Kunden-ID> fehlt" };
  const tage = Math.min(60, Math.max(1, Math.round(Number(p.get("tage") ?? 14)) || 14));
  const seit = new Date(now.getTime() - tage * 86_400_000);
  const c = await prisma.customer.findUnique({ where: { id: kunde }, select: { id: true } });
  if (!c) return { fehler: "Kunde unbekannt" };
  const leads = await prisma.lead.findMany({
    where: { customerId: kunde, createdAt: { gte: seit }, isTest: false, erasedAt: null },
    select: { id: true, createdAt: true, source: true, status: true, assignedUserId: true, callAttempts: true, reached: true, followUpAt: true },
    take: 1000,
  });
  const ids = leads.map((l) => l.id);
  const [nachrichtenRoh, anrufe, termine, aufgaben, nutzer] = await Promise.all([
    prisma.message.findMany({
      where: { conversation: { customerId: kunde, leadId: { in: ids } } },
      select: { direction: true, sentBy: true, sentByUserId: true, createdAt: true, errorCode: true, conversation: { select: { leadId: true } } },
      orderBy: { createdAt: "asc" },
      take: 20000,
    }),
    prisma.leadHistory.findMany({ where: { leadId: { in: ids }, kind: "anruf" }, select: { leadId: true, userId: true, createdAt: true } }),
    prisma.appointment.findMany({
      where: { leadId: { in: ids } },
      select: { leadId: true, createdAt: true, startsAt: true, status: true, attendance: true, bookedVia: true, angebotAbgelegtAt: true, angebotGesendetAt: true },
    }),
    prisma.leadTask.findMany({ where: { leadId: { in: ids }, status: "aktiv" }, select: { leadId: true, kind: true, dueAt: true } }),
    prisma.user.findMany({ where: { customerId: kunde, role: "BUYER" }, select: { id: true, teamRole: true } }),
  ]);
  const nachrichten = nachrichtenRoh.map((m) => ({ leadId: m.conversation.leadId!, direction: m.direction, sentBy: m.sentBy, sentByUserId: m.sentByUserId, createdAt: m.createdAt, errorCode: m.errorCode }));
  const r = zeitleisteAuswerten({ leads, nachrichten, anrufe, termine: termine.map((t) => ({ ...t, leadId: t.leadId! })), aufgaben, nutzer, now });
  return { tage, seit: fmt(seit), anzahlLeads: leads.length, ...r };
}
