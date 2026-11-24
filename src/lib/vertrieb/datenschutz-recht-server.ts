// Datenschutz und Recht im Vertrieb (Ole, 19.11.2026): Fall anlegen, Domain sperren, Aufgabe und Push an Ole,
// Nachweisprotokoll (nur anhängen), Antwortvorlagen senden. Reine Regeln in lib/vertrieb/datenschutz-recht.ts.
//
// Ablauf bei einer Antwort mit Datenschutz- bzw. Rechtsbezug (recordReply in lib/vertrieb/instantly.ts):
//   1. Antwort bekommt die Kategorie „Datenschutz/Recht“ (SalesEmail.rechtsArt), Einordnung nie „neutral“.
//   2. Kontakt „nie kontaktieren“ (App, Instantly-Blocklist, Interessenstatus in allen Kampagnen, Follow-up gestoppt,
//      lib/vertrieb/nie-kontaktieren-server.ts). Instantly-Leads werden bei einer Löschung gelöscht (art17.ts).
//   3. Eigene Agentur-Domain zusätzlich sperren: Hash „@domain“ in SalesContact.sperrHashes (Importe, Upload-Prüfung,
//      Tagesportion, Versand) und Domain auf die Instantly-Blocklist. Konzern- bzw. Portal-Domains nie (nur die Person).
//   4. Aufgabe an Ole mit Art und Frist (7 Tage; Abmahnung sofort fällig und Push an die Admins).
//   5. Nachweisprotokoll: Ereignis „eingang“ (Fall-ID, Kontakt-ID, Eingang, Art, Frist, wer). Später „antwort“ (Vorlage
//      gesendet bzw. von Hand vermerkt) und „loeschung“ (Art. 17). Keine Inhalte, keine Namen oder Adressen.
// Die Antwort auf die Anfrage selbst ist die einzige Mail, die an einen gesperrten Kontakt rausgehen darf (keine
// Werbung): nur von Hand aus der Kontaktakte, nie automatisch.

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { mailDomain } from "@/lib/vertrieb/mischen";
import { domainHash } from "@/lib/vertrieb/sperrliste";
import { nieKontaktierenSetzen } from "@/lib/vertrieb/nie-kontaktieren-server";
import { datumDe } from "@/lib/vertrieb/nie-kontaktieren";
import { ohneGedankenstriche } from "@/lib/gedankenstriche";
import {
  ABMAHNUNG_HINWEIS,
  herkunftVollstaendig,
  hatPlatzhalter,
  vorlageAuskunft,
  vorlageLoeschung,
  vorlageWiderspruch,
  type AuskunftAkte,
  RECHT_AUFGABE,
  RECHTS_ART_LABEL,
  istRechtsArt,
  rechtsAufgabeNotiz,
  rechtsAufgabeTitel,
  rechtsFrist,
  sperrDomainVon,
  type RechtsArt,
  type VorlagenArt,
} from "@/lib/vertrieb/datenschutz-recht";

export const AUTOMATISCH = "automatisch";

/** Verschiedene Vertriebskontakte (ohne Hüllen) mit Adressen dieser Domain bzw. ihrer Unterdomains. */
export async function kontakteMitDomain(domain: string): Promise<number> {
  const d = domain.trim().toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`);
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*)::bigint AS n FROM "SalesContact" c
    WHERE c."art17GeloeschtAt" IS NULL AND (
      lower(c."email") LIKE ${"%@" + d} OR lower(c."email") LIKE ${"%." + d}
      OR EXISTS (SELECT 1 FROM unnest(c."altEmails") a WHERE lower(a) LIKE ${"%@" + d} OR lower(a) LIKE ${"%." + d})
    )`;
  return Number(rows[0]?.n ?? 0);
}

/** Eigene Agentur-Domains dieser Adressen, die gesperrt werden (nicht Freemail, nicht Konzern bzw. Portal). */
export async function sperrDomains(adressen: string[]): Promise<string[]> {
  const out = new Set<string>();
  for (const a of adressen) {
    if (!a.includes("@")) continue;
    const vorab = sperrDomainVon(a, 0);
    if (!vorab || out.has(vorab)) continue;
    const d = sperrDomainVon(a, await kontakteMitDomain(mailDomain(a)));
    if (d) out.add(d);
  }
  return [...out];
}

const adressenVon = (c: { email: string; altEmails: string[] }) =>
  [...new Set([c.email, ...c.altEmails].map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@") && !e.endsWith(".invalid")))];

/** Domain-Hashes eigener Domains am Kontakt eintragen (Sperrvermerk). Liefert die gesperrten Domains. */
export async function domainSperreSetzen(contactId: string): Promise<string[]> {
  const c = await prisma.salesContact.findUnique({ where: { id: contactId }, select: { email: true, altEmails: true, sperrHashes: true } });
  if (!c) return [];
  const domains = await sperrDomains(adressenVon(c));
  const neu = domains.map(domainHash).filter((h) => !c.sperrHashes.includes(h));
  if (neu.length) await prisma.salesContact.update({ where: { id: contactId }, data: { sperrHashes: { set: [...c.sperrHashes, ...neu] } } });
  return domains;
}

/** Hat der Kontakt einen Fall „Datenschutz und Recht“? */
export async function hatRechtsFall(contactId: string): Promise<boolean> {
  return !!(await prisma.datenschutzFallEreignis.findFirst({ where: { contactId }, select: { id: true } }));
}

/** Kontakte mit Fall „Datenschutz und Recht“ aus dieser Auswahl. */
export async function kontakteMitRechtsFall(contactIds: string[]): Promise<Set<string>> {
  if (!contactIds.length) return new Set();
  const out = new Set<string>();
  for (let i = 0; i < contactIds.length; i += 5000) {
    const rows = await prisma.datenschutzFallEreignis.findMany({ where: { contactId: { in: contactIds.slice(i, i + 5000) } }, distinct: ["contactId"], select: { contactId: true } });
    for (const r of rows) if (r.contactId) out.add(r.contactId);
  }
  return out;
}

type FallOpts = {
  art: RechtsArt;
  /** Sperrgrund aus der Antwort (sonst aus der Art: Auskunft = datenschutz, sonst widerspruch) */
  grund?: "datenschutz" | "widerspruch";
  eingang: Date;
  /** antwort: Antwort per Mail; admin: von Hand (Löschknopf, Telefon) */
  quelle: "antwort" | "admin";
  /** „automatisch“ bzw. Admin-Login */
  wer?: string;
  /** gespeicherte Antwort (SalesEmail.id): Kategorie „Datenschutz/Recht“ setzen */
  emailId?: string | null;
  /** Antwortziel in Instantly (für die Antwort auch nach einer Löschung) */
  instantlyEmailId?: string | null;
  postfach?: string | null;
  now?: Date;
};

export type FallErgebnis = { fallId: string; neu: boolean; domains: string[]; aufgabe: boolean; push: boolean };

/** Grund der Sperre je Art (Auskunft = Datenschutzfrage, sonst Widerspruch). */
const grundVon = (art: RechtsArt): "datenschutz" | "widerspruch" => (art === "auskunft" ? "datenschutz" : "widerspruch");

/**
 * Fall „Datenschutz und Recht“ anlegen (idempotent je Eingang): sperren (App, Instantly), eigene Domain sperren, Aufgabe
 * mit Frist, bei Abmahnung Push an die Admins, Ereignis „eingang“ im Nachweisprotokoll. Ein offener Fall gleicher Art
 * (ohne Antwort) wird nicht verdoppelt; Abmahnungen sind immer ein eigener Fall.
 */
export async function rechtsFallAnlegen(contactId: string, opts: FallOpts): Promise<FallErgebnis> {
  const now = opts.now ?? new Date();
  const wer = opts.wer ?? AUTOMATISCH;
  if (opts.emailId) await prisma.salesEmail.update({ where: { id: opts.emailId }, data: { rechtsArt: opts.art } }).catch((e) => reportError(e, "recht-einordnung"));

  // Gleicher Eingang schon erfasst (Webhook und Abgleich) bzw. offener Fall gleicher Art
  // Je Art: eine Mail kann Abmahnung UND Auskunft enthalten (Ole, 24.11.2026), dann zwei Fälle mit eigener Frist
  const schon = await prisma.datenschutzFallEreignis.findFirst({ where: { contactId, ereignis: "eingang", eingangAt: opts.eingang, art: opts.art }, select: { fallId: true } });
  let fallId = schon?.fallId ?? null;
  if (!fallId && opts.art !== "abmahnung") {
    const offen = await prisma.datenschutzFallEreignis.findMany({ where: { contactId, ereignis: "eingang", art: opts.art }, select: { fallId: true } });
    if (offen.length) {
      const beantwortet = await prisma.datenschutzFallEreignis.findMany({ where: { fallId: { in: offen.map((o) => o.fallId) }, ereignis: "antwort" }, select: { fallId: true } });
      const zu = new Set(beantwortet.map((b) => b.fallId));
      fallId = offen.find((o) => !zu.has(o.fallId))?.fallId ?? null;
    }
  }

  const c = await prisma.salesContact.findUnique({ where: { id: contactId }, select: { nieKontaktierenAt: true, instantlyGesperrtAt: true, art17GeloeschtAt: true } });
  if (!c) return { fallId: fallId ?? "", neu: false, domains: [], aufgabe: false, push: false };
  const neu = !fallId;
  if (!fallId) {
    // Eingang zuerst ins Protokoll: die Instantly-Sperre (auch der Domain) prüft daran, ob es ein Rechtsfall ist
    fallId = randomUUID();
    await prisma.datenschutzFallEreignis.create({
      data: {
        fallId,
        contactId,
        ereignis: "eingang",
        art: opts.art,
        eingangAt: opts.eingang,
        fristAt: rechtsFrist(opts.art, opts.eingang),
        at: now,
        wer,
        detail: opts.quelle,
        instantlyEmailId: opts.instantlyEmailId ?? null,
        postfach: opts.postfach ?? null,
      },
    });
  }

  // Sperre (idempotent); Instantly samt eigener Domain über instantlySperren (Wiederholung im Cron)
  const domains = c.art17GeloeschtAt ? [] : await domainSperreSetzen(contactId);
  if (!c.nieKontaktierenAt) {
    await nieKontaktierenSetzen(contactId, opts.grund ?? grundVon(opts.art), { at: opts.eingang, quelle: opts.quelle === "admin" ? "Datenschutz und Recht, von Hand" : "Antwort per Mail (Datenschutz und Recht)", now });
  } else if (domains.length && c.instantlyGesperrtAt && !c.art17GeloeschtAt) {
    // Schon gesperrt (z. B. Austragung vorher), aber die Domain ist neu: Instantly erneut sperren (Domain auf die Blocklist)
    await prisma.salesContact.update({ where: { id: contactId }, data: { instantlyGesperrtAt: null, instantlySperreVersuche: 0 } });
    const { instantlySperren } = await import("@/lib/vertrieb/nie-kontaktieren-server");
    await instantlySperren(contactId, now);
  }
  if (!neu) return { fallId, neu: false, domains, aufgabe: false, push: false };

  // Aufgabe an Ole: höchstens eine offene je Art (Auskunft: dieselbe wie bisher, ggf. schon von nieKontaktierenSetzen)
  let aufgabe = false;
  const offeneAufgabe = await prisma.salesTask.findFirst({ where: { contactId, doneAt: null, title: { startsWith: RECHT_AUFGABE[opts.art] } }, select: { id: true } });
  if (!offeneAufgabe) {
    await prisma.salesTask.create({
      data: { contactId, title: rechtsAufgabeTitel(opts.art, opts.eingang), type: "SONSTIGES", dueAt: opts.art === "abmahnung" ? now : opts.eingang < now ? now : opts.eingang, note: rechtsAufgabeNotiz(opts.art) },
    });
    aufgabe = true;
  } else if (opts.art === "auskunft") {
    await prisma.salesTask.update({ where: { id: offeneAufgabe.id }, data: { note: rechtsAufgabeNotiz("auskunft") } }).catch(() => {});
  }

  let push = false;
  if (opts.art === "abmahnung") {
    const { sendToAdmins } = await import("@/lib/push");
    await sendToAdmins({ title: "Abmahnung bzw. rechtliche Drohung im Vertrieb", body: ABMAHNUNG_HINWEIS, url: `/admin/neu/vertrieb/kontakte/${contactId}` })
      .then(() => (push = true))
      .catch((e) => reportError(e, "recht-push"));
  }
  await audit("vertrieb.datenschutz_fall", { entity: "SalesContact", entityId: contactId, details: { fallId, art: opts.art, quelle: opts.quelle }, actor: wer === AUTOMATISCH ? { role: "system" } : undefined });
  return { fallId, neu: true, domains, aufgabe, push };
}

/**
 * Löschung (Art. 17) im Protokoll vermerken: an jedem Fall des Kontakts ohne Löschung; ohne Fall (Knopf in der
 * Kontaktakte, Anruf) entsteht ein Fall „Löschung“.
 */
export async function loeschungProtokollieren(
  contactId: string,
  opts: { eingang: Date; at: Date; wer?: string; quelle: "antwort" | "admin"; ziel?: { instantlyEmailId: string; postfach: string } | null },
): Promise<void> {
  const ziel = { instantlyEmailId: opts.ziel?.instantlyEmailId ?? null, postfach: opts.ziel?.postfach ?? null };
  const wer = opts.wer ?? AUTOMATISCH;
  const eingaenge = await prisma.datenschutzFallEreignis.findMany({ where: { contactId, ereignis: "eingang" }, orderBy: { at: "asc" } });
  if (!eingaenge.length) {
    const fallId = randomUUID();
    const fristAt = rechtsFrist("loeschung", opts.eingang);
    await prisma.datenschutzFallEreignis.create({ data: { fallId, contactId, ereignis: "eingang", art: "loeschung", eingangAt: opts.eingang, fristAt, at: opts.at, wer, detail: opts.quelle, ...ziel } });
    eingaenge.push((await prisma.datenschutzFallEreignis.findFirstOrThrow({ where: { fallId } })));
  }
  const geloescht = new Set(
    (await prisma.datenschutzFallEreignis.findMany({ where: { fallId: { in: eingaenge.map((e) => e.fallId) }, ereignis: "loeschung" }, select: { fallId: true } })).map((e) => e.fallId),
  );
  for (const e of eingaenge) {
    if (geloescht.has(e.fallId)) continue;
    await prisma.datenschutzFallEreignis.create({ data: { fallId: e.fallId, contactId, ereignis: "loeschung", art: e.art, eingangAt: e.eingangAt, fristAt: e.fristAt, at: opts.at, wer, ...ziel } });
  }
}

/** Antwort vermerken (Vorlage gesendet bzw. von Hand). */
export async function antwortProtokollieren(fallId: string, opts: { at: Date; wer: string; detail: VorlagenArt | "manuell" }): Promise<boolean> {
  const e = await prisma.datenschutzFallEreignis.findFirst({ where: { fallId, ereignis: "eingang" } });
  if (!e) return false;
  await prisma.datenschutzFallEreignis.create({ data: { fallId, contactId: e.contactId, ereignis: "antwort", art: e.art, eingangAt: e.eingangAt, fristAt: e.fristAt, at: opts.at, wer: opts.wer, detail: opts.detail } });
  // Ein Klick erledigt alles (Ole, 24.11.2026): Mit der Antwort auch die zugehörige offene Aufgabe schließen (nach der
  // Fall-Art, nicht der gewählten Vorlage), damit der Fall nicht in der Karte beantwortet, als Aufgabe aber offen bleibt.
  // Wichtig für die Abmahnung, die nur über „Als erledigt vermerken“ (ohne Vorlage) läuft.
  if (istRechtsArt(e.art)) {
    await prisma.salesTask.updateMany({ where: { contactId: e.contactId, doneAt: null, title: { startsWith: RECHT_AUFGABE[e.art] } }, data: { doneAt: opts.at } });
  }
  return true;
}

// ─── Fälle lesen (Liste „Datenschutz und Recht“, Kontaktakte) ────────────────────────────────────────────

export type RechtsFall = {
  fallId: string;
  contactId: string | null;
  art: RechtsArt;
  artLabel: string;
  eingangAt: Date;
  fristAt: Date;
  antwortAt: Date | null;
  antwortVorlage: string | null;
  loeschAt: Date | null;
  wer: string;
  /** offen = noch keine Antwort; ueberfaellig = offen und Frist vorbei */
  status: "offen" | "ueberfaellig" | "beantwortet";
  instantlyEmailId: string | null;
  postfach: string | null;
};

type Ereignis = Awaited<ReturnType<typeof prisma.datenschutzFallEreignis.findMany>>[number];

function zuFaellen(rows: Ereignis[], now: Date): RechtsFall[] {
  const je = new Map<string, Ereignis[]>();
  for (const r of rows) je.set(r.fallId, [...(je.get(r.fallId) ?? []), r]);
  const out: RechtsFall[] = [];
  for (const [fallId, ev] of je) {
    const eingang = ev.find((e) => e.ereignis === "eingang");
    if (!eingang) continue;
    const antwort = ev.filter((e) => e.ereignis === "antwort").sort((a, b) => b.at.getTime() - a.at.getTime())[0] ?? null;
    const loeschung = ev.find((e) => e.ereignis === "loeschung") ?? null;
    const art = istRechtsArt(eingang.art) ? eingang.art : "widerspruch";
    out.push({
      fallId,
      contactId: eingang.contactId,
      art,
      artLabel: RECHTS_ART_LABEL[art],
      eingangAt: eingang.eingangAt,
      fristAt: eingang.fristAt,
      antwortAt: antwort?.at ?? null,
      antwortVorlage: antwort?.detail ?? null,
      loeschAt: loeschung?.at ?? null,
      wer: eingang.wer,
      status: antwort ? "beantwortet" : now > eingang.fristAt ? "ueberfaellig" : "offen",
      instantlyEmailId: eingang.instantlyEmailId,
      postfach: eingang.postfach,
    });
  }
  // Offene zuerst (älteste Frist oben), dann beantwortete (neueste oben)
  const rang = { ueberfaellig: 0, offen: 1, beantwortet: 2 } as const;
  return out.sort((a, b) => rang[a.status] - rang[b.status] || (a.status === "beantwortet" ? b.eingangAt.getTime() - a.eingangAt.getTime() : a.fristAt.getTime() - b.fristAt.getTime()));
}

/** Alle Fälle (Liste im Admin), neueste 500 Eingänge. */
export async function rechtsFaelle(now = new Date()): Promise<RechtsFall[]> {
  const eingaenge = await prisma.datenschutzFallEreignis.findMany({ where: { ereignis: "eingang" }, orderBy: { eingangAt: "desc" }, take: 500, select: { fallId: true } });
  const rows = await prisma.datenschutzFallEreignis.findMany({ where: { fallId: { in: eingaenge.map((e) => e.fallId) } } });
  return zuFaellen(rows, now);
}

/** Fälle eines Kontakts (Kontaktakte). */
export async function rechtsFaelleVon(contactId: string, now = new Date()): Promise<RechtsFall[]> {
  return zuFaellen(await prisma.datenschutzFallEreignis.findMany({ where: { contactId } }), now);
}

/** Zeilen der Karte „Datenschutz und Recht“ eines Kontakts (mit offener Auskunftsaufgabe, siehe fallZeilen). */
export async function kartenFaelle(contactId: string, now = new Date()) {
  const [ersteFaelle, auskunft] = await Promise.all([
    rechtsFaelleVon(contactId, now),
    prisma.salesTask.findFirst({ where: { contactId, doneAt: null, title: { startsWith: RECHT_AUFGABE.auskunft } }, select: { createdAt: true } }),
  ]);
  let faelle = ersteFaelle;
  // Offene Auskunftsaufgabe ohne Fall (z. B. aus dem Nachhol-Lauf vom 19.11.2026): Fall nachtragen, damit Karte und
  // Vorlage erscheinen (Ole, 24.11.2026). Eingang = letzte Antwort per Mail, sonst Anlage der Aufgabe.
  if (auskunft && !faelle.length) {
    try {
      const mail = await prisma.salesEmail.findFirst({
        where: { contactId, direction: "IN" },
        orderBy: [{ rechtsArt: { sort: "asc", nulls: "last" } }, { sentAt: "desc" }],
        select: { id: true, sentAt: true, instantlyId: true, eaccount: true },
      });
      await rechtsFallAnlegen(contactId, {
        art: "auskunft",
        eingang: mail?.sentAt ?? auskunft.createdAt,
        quelle: "antwort",
        emailId: mail?.id ?? null,
        instantlyEmailId: mail?.instantlyId ?? null,
        postfach: mail?.eaccount ?? null,
        now,
      });
      faelle = await rechtsFaelleVon(contactId, now);
    } catch (e) {
      reportError(e, "recht-fall-nachtragen");
    }
  }
  return fallZeilen(faelle, { auskunftOffen: !!auskunft });
}

/**
 * Fälle für die Karte in der Kontaktakte (Datum als Text, Berliner Zeit). auskunftOffen: offene Auskunftsaufgabe ohne
 * eigenen Auskunfts-Fall (ältere Abmahnungen mit Art.-15-Verlangen): die Abmahnung bietet dann auch die Auskunftsvorlage.
 */
export function fallZeilen(faelle: RechtsFall[], opts: { auskunftOffen?: boolean } = {}) {
  const ohneAuskunftsFall = !faelle.some((f) => f.art === "auskunft" && f.status !== "beantwortet");
  return faelle.map((f) => ({
    auskunftOffen: f.art === "abmahnung" && !!opts.auskunftOffen && ohneAuskunftsFall,
    fallId: f.fallId,
    art: f.art,
    artLabel: f.artLabel,
    eingang: datumDe(f.eingangAt),
    frist: datumDe(f.fristAt),
    antwort: f.antwortAt ? datumDe(f.antwortAt) : null,
    loeschung: f.loeschAt ? datumDe(f.loeschAt) : null,
    status: f.status,
  }));
}

/** Offene Fälle (für Hinweis in der Kontaktliste). */
export async function offeneRechtsFaelle(now = new Date()): Promise<number> {
  return (await rechtsFaelle(now)).filter((f) => f.status !== "beantwortet").length;
}

// ─── Antwortvorlagen: Entwurf und Versand (nur von Hand) ─────────────────────────────────────────────────

export type Entwurf =
  | { ok: true; betreff: string; text: string; /** kurzer Hinweis vor dem Senden (z. B. Herkunft ergänzen) */ hinweis: string | null; /** Antwort im Instantly-Thread möglich */ sendbar: boolean }
  | { ok: false; fehler: string };

type Ziel = { replyToUuid: string; eaccount: string; threadId: string | null };

/** Antwortziel in Instantly: Mail mit der Anfrage (bzw. letzte Antwort) mit Instantly-ID und Postfach, sonst aus dem Eingang des Falls. */
async function antwortZiel(contactId: string, fallId: string | null): Promise<Ziel | null> {
  const mail = await prisma.salesEmail.findFirst({
    where: { contactId, direction: "IN", instantlyId: { not: null }, eaccount: { not: null } },
    orderBy: [{ rechtsArt: { sort: "asc", nulls: "last" } }, { sentAt: "desc" }],
    select: { instantlyId: true, eaccount: true, threadId: true },
  });
  if (mail?.instantlyId && mail.eaccount) return { replyToUuid: mail.instantlyId, eaccount: mail.eaccount, threadId: mail.threadId };
  // Eingang oder Löschung (dort sichert die Löschung das Ziel, solange die Adresse noch da ist)
  const e = await prisma.datenschutzFallEreignis.findFirst({
    where: { contactId, ereignis: { in: ["eingang", "loeschung", "ziel"] }, instantlyEmailId: { not: null }, postfach: { not: null }, ...(fallId ? { fallId } : {}) },
    orderBy: { eingangAt: "desc" },
  });
  if (e?.instantlyEmailId && e.postfach) return { replyToUuid: e.instantlyEmailId, eaccount: e.postfach, threadId: null };
  // Mail ohne Instantly-ID gespeichert (z. B. Nachhol-Lauf): Antwort direkt in der Unibox suchen (Ole, 24.11.2026)
  if (!process.env.INSTANTLY_API_KEY) return null;
  const c = await prisma.salesContact.findUnique({ where: { id: contactId }, select: { email: true, art17GeloeschtAt: true, sperrHashes: true } });
  if (!c) return null;
  const { letzteAntwortInInstantly, antwortPerHash } = await import("@/lib/vertrieb/instantly");
  if (!c.art17GeloeschtAt) {
    if (!c.email) return null;
    const t = await letzteAntwortInInstantly(c.email);
    return t ? { replyToUuid: t.id, eaccount: t.eaccount, threadId: t.threadId } : null;
  }
  // Hülle ohne gesichertes Ziel (Löschung vor dem 24.11.2026): Antwort am Eingangstag über den Sperrvermerk (Hash der
  // Adresse) in der Unibox wiederfinden; die Adresse selbst wird nicht gespeichert
  const eingang = await prisma.datenschutzFallEreignis.findFirst({ where: { contactId, ereignis: "eingang", ...(fallId ? { fallId } : {}) }, orderBy: { eingangAt: "desc" } });
  if (!eingang || !c.sperrHashes.length) return null;
  const t = await antwortPerHash(new Set(c.sperrHashes), eingang.eingangAt);
  if (!t) return null;
  // Treffer am Fall merken (Ereignis „ziel“, nur Instantly-ID und Postfach), damit nicht jedes Öffnen neu sucht
  await prisma.datenschutzFallEreignis
    .create({ data: { fallId: eingang.fallId, contactId, ereignis: "ziel", art: eingang.art, eingangAt: eingang.eingangAt, fristAt: eingang.fristAt, wer: AUTOMATISCH, instantlyEmailId: t.id, postfach: t.eaccount } })
    .catch((e) => reportError(e, "recht-ziel"));
  return { replyToUuid: t.id, eaccount: t.eaccount, threadId: t.threadId };
}

/** Entwurf einer Antwortvorlage aus der Akte (nichts wird gesendet). */
export async function rechtsVorlageEntwurf(contactId: string, vorlage: VorlagenArt): Promise<Entwurf> {
  const c = await prisma.salesContact.findUnique({ where: { id: contactId }, select: { salutation: true, firstName: true, lastName: true, art17GeloeschtAt: true } });
  if (!c) return { ok: false, fehler: "Kontakt nicht gefunden." };
  const { greetingFor } = await import("@/lib/vertrieb/followup");
  const anrede = c.art17GeloeschtAt ? "Guten Tag," : greetingFor(c);
  const sendbar = !!process.env.INSTANTLY_API_KEY && !!(await antwortZiel(contactId, null));
  if (vorlage === "widerspruch") return { ok: true, ...vorlageWiderspruch(anrede), hinweis: null, sendbar };
  if (vorlage === "loeschung") {
    if (!c.art17GeloeschtAt) return { ok: false, fehler: "Noch nicht gelöscht. Erst unter „Mehr“ „Auf Verlangen löschen (Art. 17)“ wählen, dann bestätigen." };
    return { ok: true, ...vorlageLoeschung(anrede, c.art17GeloeschtAt), hinweis: null, sendbar };
  }
  if (c.art17GeloeschtAt) return { ok: false, fehler: "Die Daten sind schon gelöscht, eine Auskunft ist nicht mehr möglich. Stattdessen die Löschung bestätigen." };
  const { vertriebAuskunftDiagnose } = await import("@/lib/ops/vertrieb-auskunft");
  const d = (await vertriebAuskunftDiagnose(new URLSearchParams({ id: contactId }))) as Record<string, unknown>;
  if (!d.gefunden) return { ok: false, fehler: "Kontakt nicht gefunden." };
  const herkunft = d.herkunft as AuskunftAkte["herkunft"];
  // Direkt in Instantly hochgeladen: Übernahmedatum aus Instantly (Ole, 24.11.2026)
  if (herkunft.art !== "öffentliche Vermittlerliste" && process.env.INSTANTLY_API_KEY) {
    const mail = await prisma.salesContact.findUnique({ where: { id: contactId }, select: { email: true } });
    if (mail?.email) {
      const { leadAngelegtAm } = await import("@/lib/vertrieb/instantly");
      herkunft.inInstantlySeit = await leadAngelegtAm(mail.email);
    }
  }
  const akte: AuskunftAkte = {
    felder: (d.felder ?? {}) as Record<string, unknown>,
    herkunft,
    weitereEmpfaenger: (d.empfaengerArten ?? []) as AuskunftAkte["weitereEmpfaenger"],
    mailsAnIhn: (d.mailsAnIhn ?? []) as AuskunftAkte["mailsAnIhn"],
    antwortenVonIhm: (d.antwortenVonIhm ?? []) as AuskunftAkte["antwortenVonIhm"],
    gesperrtSeit: (d.sperre as { seit?: string | null } | null)?.seit ?? null,
  };
  return {
    ok: true,
    ...vorlageAuskunft(anrede, akte),
    hinweis: herkunftVollstaendig(herkunft) ? null : "Herkunft automatisch: öffentliche Angaben im Internet, Fundstelle nicht gespeichert. Kennen Sie die genaue Quelle, unter „2. Herkunft“ ergänzen.",
    sendbar,
  };
}

/**
 * Vorlage senden (Knopf in der Kontaktakte): Antwort im Instantly-Thread aus dem Postfach, das die Anfrage empfangen
 * hat. Einzige Mail, die an einen gesperrten Kontakt gehen darf (Antwort auf seine Anfrage, keine Werbung), und nur
 * von Hand. Danach Ereignis „antwort“ im Nachweisprotokoll. Bei einer Hülle (Art. 17) wird der Inhalt nicht gespeichert.
 */
export async function rechtsVorlageSenden(
  contactId: string,
  opts: { fallId: string; vorlage: VorlagenArt; betreff: string; text: string; wer: string; now?: Date },
): Promise<{ ok: true } | { ok: false; fehler: string }> {
  const now = opts.now ?? new Date();
  const fall = await prisma.datenschutzFallEreignis.findFirst({ where: { fallId: opts.fallId, contactId, ereignis: "eingang" }, select: { id: true } });
  if (!fall) return { ok: false, fehler: "Fall nicht gefunden." };
  const text = ohneGedankenstriche(opts.text.replace(/\r/g, "").trim());
  const betreff = ohneGedankenstriche(opts.betreff.trim()) || "Ihre Anfrage";
  if (!text) return { ok: false, fehler: "Der Text ist leer." };
  // Platzhalter (z. B. Herkunft) nicht ersetzt: nicht senden (Ole, 24.11.2026)
  if (hatPlatzhalter(text)) return { ok: false, fehler: "Bitte zuerst den Platzhalter in eckigen Klammern ersetzen (z. B. die Herkunft der Adresse)." };
  const manuell = "Text kopieren, im Instantly-Postfach als Antwort senden und hier als beantwortet vermerken.";
  if (!process.env.INSTANTLY_API_KEY) return { ok: false, fehler: `Instantly ist nicht verbunden. ${manuell}` };
  const ziel = await antwortZiel(contactId, opts.fallId);
  if (!ziel) return { ok: false, fehler: `Keine Mail des Kontakts in Instantly gefunden. ${manuell}` };
  const { replyInThread } = await import("@/lib/vertrieb/instantly");
  const { textToHtml } = await import("@/lib/vertrieb/followup");
  let res: { id: string | null; threadId: string | null };
  try {
    res = await replyInThread({ eaccount: ziel.eaccount, replyToUuid: ziel.replyToUuid, subject: betreff, html: `<div>${textToHtml(text)}</div>`, text });
  } catch (e) {
    reportError(e, "recht-vorlage-senden");
    return { ok: false, fehler: `Instantly hat die Antwort nicht angenommen. ${manuell}` };
  }
  await antwortProtokollieren(opts.fallId, { at: now, wer: opts.wer, detail: opts.vorlage });
  const huelle = (await prisma.salesContact.findUnique({ where: { id: contactId }, select: { art17GeloeschtAt: true } }))?.art17GeloeschtAt;
  if (!huelle) {
    await prisma.salesEmail
      .create({ data: { contactId, campaign: "Datenschutz", direction: "OUT", subject: betreff, text, fromEmail: ziel.eaccount, eaccount: ziel.eaccount, threadId: res.threadId ?? ziel.threadId, instantlyId: res.id, sentAt: now } })
      .catch((e) => reportError(e, "recht-vorlage-speichern"));
    await prisma.salesActivity
      .create({ data: { contactId, type: "EMAIL", outcome: "Datenschutz-Antwort gesendet", note: `${betreff}\n\n${text}`, occurredAt: now } })
      .catch((e) => reportError(e, "recht-vorlage-speichern"));
  }
  // Die Aufgabe der Fall-Art schließt antwortProtokollieren; zusätzlich die der gesendeten Vorlage (z. B. Auskunft auf
  // einem Fall „Abmahnung“, der vor dem 24.11.2026 ohne eigenen Auskunfts-Fall angelegt wurde)
  await prisma.salesTask.updateMany({ where: { contactId, doneAt: null, title: { startsWith: RECHT_AUFGABE[opts.vorlage] } }, data: { doneAt: now } });
  await audit("vertrieb.datenschutz_antwort", { entity: "SalesContact", entityId: contactId, details: { fallId: opts.fallId, vorlage: opts.vorlage } });
  return { ok: true };
}
