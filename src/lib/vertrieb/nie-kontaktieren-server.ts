// „Nie kontaktieren“ setzen, in Instantly durchsetzen und nachholen (Ole, 19.11.2026). Erkennung in
// lib/vertrieb/nie-kontaktieren.ts. Wer das Merkmal hat, bekommt aus der App nichts mehr (kontaktGesperrt in
// lib/vertrieb/sperrliste.ts: Später-Follow-up, Erinnerungen, WhatsApp, Angebotsmail) und Instantly schreibt ihn nicht
// mehr an: Adresse auf die Blocklist des Workspaces (POST /api/v2/block-lists-entries, gilt für alle Kampagnen) und in
// jeder Kampagne Interessenstatus „kein Interesse“ (POST /api/v2/leads/update-interest-status, -1). Eine eigene
// Abmelde-Schnittstelle hat die API v2 nicht. Instantly wird nur mit INSTANTLY_AUTO_SYNC=1 beschrieben (Produktion);
// Fehler bleiben offen (instantlyGesperrtAt = NULL) und der Instantly-Cron wiederholt alle 15 Minuten.
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { instantlyFetch } from "@/lib/vertrieb/instantly-drossel";
import { contactIdsByEmails } from "@/lib/vertrieb/contact-merge";
import { emailGesperrt, geloeschteAdressen } from "@/lib/vertrieb/sperrliste";
import { AUSKUNFT_AUFGABE, SPERR_GRUND_LABEL, auskunftsAufgabe, sperrGrundAusAntwort, type SperrGrund } from "@/lib/vertrieb/nie-kontaktieren";

/** Nach so vielen Fehlversuchen versucht der Cron es nicht mehr (Diagnose zeigt „fehlgeschlagen“). */
export const MAX_SPERR_VERSUCHE = 20;
/** Interessenstatus „Not Interested“ in Instantly */
const KEIN_INTERESSE = -1;

/** Schreibt die App nach Instantly? Nur Produktion (wie Später-Follow-up und Abgleich). */
export function instantlySchreibbar(): boolean {
  return !!process.env.INSTANTLY_API_KEY && process.env.INSTANTLY_AUTO_SYNC === "1";
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  // Drossel und Retry-After (lib/vertrieb/instantly-drossel.ts)
  const res = await instantlyFetch(path, init, { versuche: 3 });
  if (!res.ok) throw new Error(`Instantly ${path.split("?")[0]}: ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

const adressenVon = (c: { email: string; altEmails: string[] }) =>
  [...new Set([c.email, ...c.altEmails].map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@")))];

/** Adresse auf der Instantly-Blocklist? Sonst eintragen. */
export async function aufBlocklist(email: string): Promise<"vorhanden" | "eingetragen"> {
  const q = new URLSearchParams({ search: email, limit: "10" });
  const page = await api<{ items?: { bl_value?: string }[] }>(`/block-lists-entries?${q}`);
  if ((page.items ?? []).some((e) => e.bl_value?.trim().toLowerCase() === email)) return "vorhanden";
  await api("/block-lists-entries", { method: "POST", body: JSON.stringify({ bl_value: email }) });
  return "eingetragen";
}

/** In jeder Kampagne mit dieser Adresse: Interessenstatus „kein Interesse“. Anzahl Kampagnen. */
async function inKampagnenStoppen(email: string): Promise<number> {
  const q = new URLSearchParams({ search: email });
  const page = await api<{ items?: { id: string }[] }>(`/campaigns/search-by-contact?${q}`);
  const kampagnen = page.items ?? [];
  for (const k of kampagnen) {
    await api("/leads/update-interest-status", { method: "POST", body: JSON.stringify({ lead_email: email, campaign_id: k.id, interest_value: KEIN_INTERESSE }) });
  }
  return kampagnen.length;
}

export type InstantlySperrErgebnis = "erledigt" | "aus" | "fehler" | "nicht_gesperrt";

/** Gesperrten Kontakt in Instantly sperren (alle Adressen). Fehler werden gespeichert, nie geworfen. */
export async function instantlySperren(contactId: string, now = new Date()): Promise<InstantlySperrErgebnis> {
  const c = await prisma.salesContact.findUnique({ where: { id: contactId }, select: { email: true, altEmails: true, nieKontaktierenAt: true } });
  if (!c?.nieKontaktierenAt) return "nicht_gesperrt";
  if (!instantlySchreibbar()) return "aus";
  try {
    for (const email of adressenVon(c)) {
      await aufBlocklist(email);
      await inKampagnenStoppen(email);
    }
    // Fall „Datenschutz und Recht“ (Ole, 19.11.2026): eigene Agentur-Domain ebenfalls auf die Blocklist (nie Freemail,
    // nie Konzern- bzw. Portal-Domain, lib/vertrieb/datenschutz-recht.ts)
    const dr = await import("@/lib/vertrieb/datenschutz-recht-server");
    if (await dr.hatRechtsFall(contactId)) for (const d of await dr.sperrDomains(adressenVon(c))) await aufBlocklist(d);
    await prisma.salesContact.update({ where: { id: contactId }, data: { instantlyGesperrtAt: now, instantlySperreFehler: null } });
    return "erledigt";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    reportError(e, "nie-kontaktieren-instantly");
    await prisma.salesContact.update({ where: { id: contactId }, data: { instantlySperreVersuche: { increment: 1 }, instantlySperreFehler: msg.slice(0, 500) } });
    return "fehler";
  }
}

/** Offene Instantly-Sperren wiederholen (Instantly-Cron). */
export async function instantlySperrenNachholen(limit = 25, now = new Date()): Promise<{ erledigt: number; fehler: number; offen: number }> {
  const out = { erledigt: 0, fehler: 0, offen: 0 };
  if (!instantlySchreibbar()) return out;
  const offen = await prisma.salesContact.findMany({
    where: { nieKontaktierenAt: { not: null }, instantlyGesperrtAt: null, instantlySperreVersuche: { lt: MAX_SPERR_VERSUCHE } },
    orderBy: { nieKontaktierenAt: "asc" },
    take: limit,
    select: { id: true },
  });
  for (const { id } of offen) {
    const r = await instantlySperren(id, now);
    if (r === "erledigt") out.erledigt++;
    else if (r === "fehler") out.fehler++;
  }
  out.offen = await prisma.salesContact.count({ where: { nieKontaktierenAt: { not: null }, instantlyGesperrtAt: null } });
  return out;
}

/** Instantly muss den Kontakt erneut sperren (z. B. in einer neuen Kampagne aufgetaucht). */
export async function instantlySperreErneuern(contactId: string) {
  await prisma.salesContact.updateMany({
    where: { id: contactId, nieKontaktierenAt: { not: null }, instantlyGesperrtAt: { not: null } },
    data: { instantlyGesperrtAt: null, instantlySperreVersuche: 0 },
  });
}

type SetzenOpts = {
  at?: Date;
  /** für den Verlauf, z. B. „Antwort per Mail“, „Abmeldung in Instantly“, „Nachhol-Lauf“ */
  quelle?: string;
  /** false: Instantly erst im nächsten Cron-Lauf (Nachhol-Lauf) */
  instantly?: boolean;
  now?: Date;
};

export type SetzenErgebnis = { neu: boolean; aufgabe: boolean; instantly: InstantlySperrErgebnis | "spaeter" };

/**
 * Merkmal setzen (idempotent: Zeitpunkt und Grund der ersten Sperre bleiben). Stoppt das Später-Follow-up,
 * legt bei Datenschutzfragen die Aufgabe „Auskunft nach Art. 15 beantworten, Frist …“ an und sperrt in Instantly.
 */
export async function nieKontaktierenSetzen(contactId: string, grund: SperrGrund, opts: SetzenOpts = {}): Promise<SetzenErgebnis> {
  const now = opts.now ?? new Date();
  const at = opts.at ?? now;
  const gesetzt = await prisma.salesContact.updateMany({
    where: { id: contactId, nieKontaktierenAt: null },
    data: { nieKontaktierenAt: at, nieKontaktierenGrund: grund, instantlyGesperrtAt: null, instantlySperreVersuche: 0, instantlySperreFehler: null },
  });
  const neu = gesetzt.count === 1;
  if (neu) {
    await prisma.salesActivity.create({
      data: {
        contactId,
        type: "NOTIZ",
        outcome: "Nie kontaktieren",
        note: `${SPERR_GRUND_LABEL[grund]}${opts.quelle ? ` (${opts.quelle})` : ""}. Keine Nachrichten mehr aus der App, in Instantly gestoppt und auf der Blocklist.`,
        occurredAt: now,
      },
    });
    await import("@/lib/vertrieb/followup").then((m) => m.stopFollowup(contactId, "Nie kontaktieren")).catch((e) => reportError(e, "followup-stop"));
  }
  const aufgabe = grund === "datenschutz" ? await auskunftsAufgabeAnlegen(contactId, at, now) : false;
  let instantly: SetzenErgebnis["instantly"] = "spaeter";
  if (opts.instantly !== false) {
    const c = await prisma.salesContact.findUnique({ where: { id: contactId }, select: { instantlyGesperrtAt: true } });
    instantly = c?.instantlyGesperrtAt ? "erledigt" : await instantlySperren(contactId, now);
  }
  return { neu, aufgabe, instantly };
}

/** Aufgabe „Auskunft nach Art. 15 beantworten, Frist …“, höchstens eine je Anfrage (keine, die nach ihr angelegt wurde). */
async function auskunftsAufgabeAnlegen(contactId: string, eingang: Date, now: Date): Promise<boolean> {
  const schon = await prisma.salesTask.findFirst({
    where: { contactId, title: { startsWith: AUSKUNFT_AUFGABE }, OR: [{ doneAt: null }, { createdAt: { gte: eingang } }] },
    select: { id: true },
  });
  if (schon) return false;
  await prisma.salesTask.create({
    data: {
      contactId,
      title: auskunftsAufgabe(eingang),
      type: "SONSTIGES",
      dueAt: eingang < now ? now : eingang,
      note: "Der Kontakt fragt nach Datenschutz bzw. Herkunft der Adresse. Auskunft schicken: Kontaktakte → Datenschutz und Recht → Vorlage „Auskunft (Art. 15)“ prüfen und senden. Der Kontakt ist gesperrt: die App schreibt ihn nicht mehr an.",
    },
  });
  return true;
}

/**
 * Merkmal von Hand aufheben (Kontaktakte). Die Instantly-Blocklist bleibt, dort bei Bedarf selbst entfernen. Nie bei
 * einem Fall „Datenschutz und Recht“ (Ole, 19.11.2026): dann bleibt die Sperre (Rückgabe false).
 */
export async function nieKontaktierenAufheben(contactId: string, now = new Date()) {
  if (await prisma.datenschutzFallEreignis.findFirst({ where: { contactId }, select: { id: true } })) return false;
  const r = await prisma.salesContact.updateMany({
    where: { id: contactId, nieKontaktierenAt: { not: null } },
    data: { nieKontaktierenAt: null, nieKontaktierenGrund: null, instantlyGesperrtAt: null, instantlySperreVersuche: 0, instantlySperreFehler: null },
  });
  if (r.count) {
    await prisma.salesActivity.create({
      data: { contactId, type: "NOTIZ", outcome: "Nie kontaktieren aufgehoben", note: "Von Hand. Die Adresse steht weiter auf der Instantly-Blocklist.", occurredAt: now },
    });
  }
  return r.count === 1;
}

// ─── Nachhol-Lauf über alle bisherigen Antworten ─────────────────────────────

export type SperrNachholErgebnis = {
  angewendet: boolean;
  /** geprüfte echte Antworten (ohne Abwesenheitsnotizen) */
  gelesen: number;
  /** Antworten mit Treffer je Grund */
  treffer: Record<"austragen" | "widerspruch" | "datenschutz", number>;
  /** Kontakte mit Treffer (Antwort oder Abmeldung in Instantly) */
  kontakte: number;
  /** davon schon gesperrt */
  schonGesperrt: number;
  /** neu gesperrt (Vorschau: würden gesperrt) je Grund */
  neu: Record<SperrGrund, number>;
  /** Abmeldungen in Instantly (Kampagnen-Status), ohne Treffer im Text */
  abgemeldetInInstantly: number;
  /** übersprungen: später Termin, Kunde oder positive Antwort nach dem Treffer (Ole prüft von Hand) */
  uebersprungen: number;
  /** angelegte Aufgaben „Auskunft nach Art. 15“ */
  aufgaben: number;
  /** Instantly-Sperren (nur Anwenden, nur mit INSTANTLY_AUTO_SYNC=1; Rest übernimmt der Cron) */
  instantly: { erledigt: number; fehler: number; offen: number };
};

const RANG: Record<string, number> = { datenschutz: 3, widerspruch: 2, austragen: 1 };

/**
 * Einmaliger Nachhol-Lauf (Ole, 19.11.2026): alle gespeicherten Antworten auf die Muster prüfen und Treffer sperren,
 * dazu Kontakte, die sich in Instantly abgemeldet haben. Idempotent (schon gesperrte bleiben, wie sie sind; je
 * Datenschutzfrage höchstens eine Aufgabe). anwenden = false: nur zählen, nichts schreiben.
 */
export async function sperrenAusAntworten(opts: { anwenden?: boolean; now?: Date } = {}): Promise<SperrNachholErgebnis> {
  const now = opts.now ?? new Date();
  const anwenden = !!opts.anwenden;
  const out: SperrNachholErgebnis = {
    angewendet: anwenden,
    gelesen: 0,
    treffer: { austragen: 0, widerspruch: 0, datenschutz: 0 },
    kontakte: 0,
    schonGesperrt: 0,
    neu: { austragen: 0, widerspruch: 0, datenschutz: 0, bounce_hart: 0, manuell: 0 },
    abgemeldetInInstantly: 0,
    uebersprungen: 0,
    aufgaben: 0,
    instantly: { erledigt: 0, fehler: 0, offen: 0 },
  };
  // Kontakt → stärkster Grund, Zeitpunkt der (ersten) Antwort mit diesem Grund
  const funde = new Map<string, { grund: SperrGrund; at: Date; quelle: string }>();
  let cursor: string | undefined;
  for (;;) {
    const page = await prisma.salesEmail.findMany({
      where: { direction: "IN", isAutoReply: false },
      orderBy: { id: "asc" },
      take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, contactId: true, text: true, subject: true, sentAt: true },
    });
    if (!page.length) break;
    cursor = page[page.length - 1].id;
    for (const m of page) {
      out.gelesen++;
      const grund = sperrGrundAusAntwort(m.text, m.subject);
      if (!grund) continue;
      out.treffer[grund]++;
      const alt = funde.get(m.contactId);
      if (!alt || RANG[grund] > RANG[alt.grund] || (RANG[grund] === RANG[alt.grund] && m.sentAt < alt.at)) {
        funde.set(m.contactId, { grund, at: m.sentAt, quelle: "Antwort per Mail, Nachhol-Lauf" });
      }
    }
  }
  // Abmeldungen in Instantly (Abmeldelink bzw. Status „Abgemeldet“)
  const abgemeldet = await prisma.salesCampaignLead.findMany({ where: { unsubscribed: true }, select: { contactId: true, updatedAt: true } });
  for (const l of abgemeldet) {
    if (funde.has(l.contactId)) continue;
    funde.set(l.contactId, { grund: "austragen", at: l.updatedAt, quelle: "Abmeldung in Instantly, Nachhol-Lauf" });
    out.abgemeldetInInstantly++;
  }

  out.kontakte = funde.size;
  for (const [contactId, f] of funde) {
    const c = await prisma.salesContact.findUnique({ where: { id: contactId }, select: { nieKontaktierenAt: true, stage: true, customerId: true } });
    if (!c) continue;
    if (c.nieKontaktierenAt) {
      out.schonGesperrt++;
      // Datenschutzfrage ohne Aufgabe (z. B. vor dem Merkmal von Hand gesperrt): Aufgabe nachholen
      if (anwenden && f.grund === "datenschutz" && (await auskunftsAufgabeAnlegen(contactId, f.at, now))) out.aufgaben++;
      continue;
    }
    // Danach Termin, Kunde oder Zusage: nicht blind sperren (Gesinnungswandel), Ole entscheidet in der Kontaktakte
    const spaeterPositiv = await prisma.salesEmail.findFirst({
      where: { contactId, direction: "IN", isAutoReply: false, sentAt: { gt: f.at }, sentiment: { in: ["POSITIV", "SPAETER"] } },
      select: { id: true },
    });
    if (c.customerId || c.stage === "GEWONNEN" || c.stage === "TERMIN" || spaeterPositiv) {
      out.uebersprungen++;
      continue;
    }
    out.neu[f.grund]++;
    if (!anwenden) continue;
    const r = await nieKontaktierenSetzen(contactId, f.grund, { at: f.at, quelle: f.quelle, instantly: false, now });
    if (r.aufgabe) out.aufgaben++;
  }
  if (anwenden) out.instantly = await instantlySperrenNachholen(200, now);
  else out.instantly.offen = await prisma.salesContact.count({ where: { nieKontaktierenAt: { not: null }, instantlyGesperrtAt: null } });
  return out;
}

// ─── Abgleich vor einem Upload zu Instantly ─────────────────────────────────

export type UploadSperrGrund = "sperrliste" | "nie_kontaktieren" | "abgemeldet" | "bounce_hart" | "blocklist";
export type UploadPruefung = { erlaubt: string[]; gesperrt: { email: string; grund: UploadSperrGrund }[]; zaehler: Record<UploadSperrGrund, number> };

/** Alle Einträge der Instantly-Blocklist (Adressen und Domains, klein geschrieben). Nur lesend. */
export async function instantlyBlocklist(): Promise<Set<string>> {
  const out = new Set<string>();
  let after: string | undefined;
  do {
    const q = new URLSearchParams({ limit: "100" });
    if (after) q.set("starting_after", after);
    const page = await api<{ items?: { bl_value?: string }[]; next_starting_after?: string }>(`/block-lists-entries?${q}`);
    for (const e of page.items ?? []) if (e.bl_value) out.add(e.bl_value.trim().toLowerCase());
    after = page.items?.length ? page.next_starting_after : undefined;
  } while (after);
  return out;
}

/**
 * Adressen vor dem Hochladen in eine Instantly-Kampagne prüfen: feste Sperrliste, „nie kontaktieren“, Abmeldung
 * und harte Bounces aus früheren Kampagnen sowie (optional) die Instantly-Blocklist (Adresse oder Domain).
 * Jeder Upload aus der App geht durch diese Funktion; Listen, die direkt in Instantly landen, schützt die Blocklist.
 */
export async function vorUploadPruefen(emails: string[], opts: { blocklist?: Set<string> } = {}): Promise<UploadPruefung> {
  const liste = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@")))];
  const ids = await contactIdsByEmails(liste);
  // Auf Verlangen gelöscht (Art. 17): nur noch als Hash bekannt
  const geloescht = await geloeschteAdressen(liste);
  const kontaktIds = [...new Set(ids.values())];
  const { kontakteMitRechtsFall } = await import("@/lib/vertrieb/datenschutz-recht-server");
  const [kontakte, leads, recht] = await Promise.all([
    prisma.salesContact.findMany({ where: { id: { in: kontaktIds }, nieKontaktierenAt: { not: null } }, select: { id: true } }),
    prisma.salesCampaignLead.findMany({ where: { contactId: { in: kontaktIds }, OR: [{ unsubscribed: true }, { bounced: true }] }, select: { contactId: true, unsubscribed: true, bounced: true } }),
    // Fall „Datenschutz und Recht“ sperrt immer, auch wenn „nie kontaktieren“ (fälschlich) fehlt
    kontakteMitRechtsFall(kontaktIds),
  ]);
  const nie = new Set([...kontakte.map((k) => k.id), ...recht]);
  const abgemeldet = new Set(leads.filter((l) => l.unsubscribed).map((l) => l.contactId));
  const bounce = new Set(leads.filter((l) => l.bounced).map((l) => l.contactId));
  const out: UploadPruefung = { erlaubt: [], gesperrt: [], zaehler: { sperrliste: 0, nie_kontaktieren: 0, abgemeldet: 0, bounce_hart: 0, blocklist: 0 } };
  for (const email of liste) {
    const id = ids.get(email);
    const domain = email.split("@").pop()!;
    const grund: UploadSperrGrund | null = emailGesperrt(email)
      ? "sperrliste"
      : geloescht.has(email) || (id && nie.has(id))
        ? "nie_kontaktieren"
        : id && abgemeldet.has(id)
          ? "abgemeldet"
          : id && bounce.has(id)
            ? "bounce_hart"
            : opts.blocklist && (opts.blocklist.has(email) || opts.blocklist.has(domain))
              ? "blocklist"
              : null;
    if (grund) {
      out.gesperrt.push({ email, grund });
      out.zaehler[grund]++;
    } else out.erlaubt.push(email);
  }
  return out;
}

// ─── Zähler für die Diagnose (ohne Adressen) ─────────────────────────────────

export async function sperrZaehler() {
  const [jeGrund, offen, fehlgeschlagen, auskunftOffen] = await Promise.all([
    prisma.salesContact.groupBy({ by: ["nieKontaktierenGrund"], where: { nieKontaktierenAt: { not: null } }, _count: true }),
    prisma.salesContact.count({ where: { nieKontaktierenAt: { not: null }, instantlyGesperrtAt: null } }),
    prisma.salesContact.count({ where: { nieKontaktierenAt: { not: null }, instantlyGesperrtAt: null, instantlySperreVersuche: { gte: MAX_SPERR_VERSUCHE } } }),
    prisma.salesTask.count({ where: { doneAt: null, title: { startsWith: AUSKUNFT_AUFGABE } } }),
  ]);
  const grund: Record<string, number> = { austragen: 0, widerspruch: 0, datenschutz: 0, bounce_hart: 0, manuell: 0 };
  for (const g of jeGrund) grund[g.nieKontaktierenGrund ?? "unbekannt"] = (grund[g.nieKontaktierenGrund ?? "unbekannt"] ?? 0) + g._count;
  return {
    gesamt: Object.values(grund).reduce((a, b) => a + b, 0),
    jeGrund: grund,
    instantlyOffen: offen,
    instantlyFehlgeschlagen: fehlgeschlagen,
    auskunftAufgabenOffen: auskunftOffen,
    instantlyWirdBeschrieben: instantlySchreibbar(),
  };
}
