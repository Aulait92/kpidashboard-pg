// Löschung auf Verlangen (Art. 17 DSGVO) im Vertrieb (Ole, 19.11.2026). Auslöser: Antwort mit ausdrücklichem
// Löschverlangen (lib/vertrieb/nie-kontaktieren.ts dsgvoAusAntwort, aus recordReply) oder der Knopf „Auf Verlangen
// löschen (Art. 17)“ in der Kontaktakte (Anfrage per Mail oder Telefon).
//
// Ablauf:
//   1. Ausnahmen: Kunde (Kundenkonto, Login, Login-Domain), Angebot, Lead eines Kunden, Empfehlung eines Kunden. Dann
//      nicht löschen, nur sperren und Aufgabe „Löschverlangen prüfen (Kunde/Lead), Frist …“.
//   2. Instantly: Adresse auf die Blocklist, Lead in jeder Kampagne löschen (DELETE /api/v2/leads/{id}). Fehler → Aufgabe
//      an Ole, lokal wird trotzdem gelöscht.
//   3. Weitere Vertriebskontakte mit derselben Adresse (Haupt- oder Zusatzadresse) werden ganz gelöscht ("überall",
//      Ole 19.11.2026); die Ausnahmen aus 1. gelten über alle diese Kontakte. Ins alte Cold CRM (Airtable) schreibt die
//      App nicht: Aufgabe „Im alten Cold CRM (Airtable) löschen“.
//   4. Lokal: Verlauf, Aufgaben, Mails, Follow-ups, Kampagnen-Status, Termine, Telefonnummern, Präsentationslinks,
//      WhatsApp-Chats, LinkedIn- und Formular-Eingänge löschen; alle Felder mit Personenbezug leeren. Der Datensatz
//      bleibt als Hülle: Name „Gelöscht auf Verlangen (Art. 17 DSGVO)“, „nie kontaktieren“, ein Verlaufseintrag ohne
//      Personenbezug, die Adressen nur als SHA-256 (sperrHashes) für künftige Importe, Uploads und Antworten.
//   5. Löschprotokoll (art „vertriebskontakt_art17“): greift nach einer Wiederherstellung der Datenbank erneut.
//   6. Audit „vertrieb.geloescht_art17“ nur mit Kontakt-ID, Datum und Quelle.
// Widerspruch ohne Löschverlangen löscht nicht (Sperrvermerk statt Löschung, docs/datenschutz.md).

import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { ownEmailDomain } from "@/lib/vertrieb/dubletten";
import { emailHash } from "@/lib/vertrieb/sperrliste";
import { ART17_NAME, AUSKUNFT_VOR_LOESCHUNG_AUFGABE, LOESCH_PRUEFEN_AUFGABE, aufgabeMitFrist, art17Vermerk, type SperrGrund } from "@/lib/vertrieb/nie-kontaktieren";
import { api as instantlyApi, aufBlocklist, instantlySchreibbar, nieKontaktierenSetzen } from "@/lib/vertrieb/nie-kontaktieren-server";

export const ART17_AUSNAHME_LABEL = {
  kunde: "Kunde (Kundenkonto)",
  login: "Login in der App",
  kunde_domain: "Domain eines Kunden-Logins",
  angebot: "Angebot",
  lead: "Lead eines Kunden",
  empfehlung: "Empfehlung eines Kunden",
} as const;
export type Art17Ausnahme = keyof typeof ART17_AUSNAHME_LABEL;

export type Art17Ergebnis = {
  status: "geloescht" | "ausnahme" | "auskunft_zuerst" | "schon_geloescht" | "nicht_gefunden";
  gruende?: Art17Ausnahme[];
  /** Instantly: erledigt, aus (nicht Produktion) oder fehler (Aufgabe an Ole) */
  instantly?: "erledigt" | "aus" | "fehler" | "uebersprungen";
};

const INSTANTLY_AUFGABE = "Instantly: Löschung (Art. 17) von Hand nachholen";
const NACHRICHT_AUFGABE = "Neue Nachricht einer auf Verlangen gelöschten Adresse";
export const COLD_CRM_AUFGABE = "Im alten Cold CRM (Airtable) löschen";
const BLEIBENDE_AUFGABEN = [{ title: { startsWith: INSTANTLY_AUFGABE } }, { title: { startsWith: NACHRICHT_AUFGABE } }, { title: { startsWith: COLD_CRM_AUFGABE } }];
export const art17Email = (contactId: string) => `geloescht-${contactId}@art17.invalid`;

const norm = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

/** Alle bekannten Adressen des Kontakts (Haupt, weitere, Absender seiner Antworten), klein geschrieben. */
async function adressen(contactId: string, c: { email: string; altEmails: string[] }): Promise<string[]> {
  const absender = await prisma.salesEmail.findMany({ where: { contactId, direction: "IN", fromEmail: { not: null } }, distinct: ["fromEmail"], select: { fromEmail: true } });
  return [...new Set([c.email, ...c.altEmails, ...absender.map((a) => a.fromEmail ?? "")].map(norm).filter((e) => e.includes("@") && !e.endsWith(".invalid")))];
}

/** Gründe, den Kontakt nicht zu löschen (Kunde, Login, Angebot, Lead eines Kunden, Empfehlung). Leer = löschen. */
export async function art17Ausnahmen(contactId: string): Promise<Art17Ausnahme[]> {
  const c = await prisma.salesContact.findUnique({
    where: { id: contactId },
    select: { email: true, altEmails: true, customerId: true, customerStage: true, stage: true, _count: { select: { offers: true, colleagueReferrals: true } } },
  });
  if (!c) return [];
  const liste = await adressen(contactId, c);
  const out: Art17Ausnahme[] = [];
  if (c.customerId || c.customerStage || c.stage === "GEWONNEN") out.push("kunde");
  const insensitiv = { in: liste, mode: "insensitive" as const };
  const [login, angebot, lead, empfehlung] = liste.length
    ? await Promise.all([
        prisma.user.findFirst({ where: { email: insensitiv }, select: { id: true } }),
        prisma.offer.findFirst({ where: { email: insensitiv }, select: { id: true } }),
        prisma.lead.findFirst({ where: { OR: [{ email: insensitiv }, { weitereEmails: { hasSome: liste } }] }, select: { id: true } }),
        prisma.colleagueReferral.findFirst({ where: { email: insensitiv }, select: { id: true } }),
      ])
    : [null, null, null, null];
  if (login) out.push("login");
  else {
    const domains = [...new Set(liste.map(ownEmailDomain).filter((d): d is string => !!d))];
    if (domains.length && (await prisma.user.findFirst({ where: { OR: domains.map((d) => ({ email: { endsWith: `@${d}`, mode: "insensitive" as const } })) }, select: { id: true } }))) {
      out.push("kunde_domain");
    }
  }
  if (c._count.offers || angebot) out.push("angebot");
  if (lead) out.push("lead");
  if (c._count.colleagueReferrals || empfehlung) out.push("empfehlung");
  return out;
}

/** Aufgabe am Kontakt, höchstens eine offene je Titel-Anfang. */
async function aufgabe(contactId: string, titel: string, eingang: Date, now: Date, note: string): Promise<boolean> {
  const schon = await prisma.salesTask.findFirst({ where: { contactId, doneAt: null, title: { startsWith: titel } }, select: { id: true } });
  if (schon) return false;
  await prisma.salesTask.create({ data: { contactId, title: aufgabeMitFrist(titel, eingang), type: "SONSTIGES", dueAt: now, note } });
  return true;
}

/** Instantly: Blocklist und Leads löschen. Fehlertext ohne Adressen. */
async function instantlyLoeschen(liste: string[]): Promise<{ ok: true } | { ok: false; fehler: string }> {
  try {
    for (const email of liste) {
      await aufBlocklist(email);
      const page = await instantlyApi<{ items?: { id: string; email?: string | null }[] }>("/leads/list", { method: "POST", body: JSON.stringify({ search: email, limit: 100 }) });
      for (const l of page.items ?? []) {
        if (norm(l.email) !== email) continue;
        // Body {} statt leer: die API lehnt DELETE mit Content-Type JSON ohne Body ab
        await instantlyApi(`/leads/${encodeURIComponent(l.id)}`, { method: "DELETE", body: "{}" });
      }
    }
    return { ok: true };
  } catch (e) {
    let msg = e instanceof Error ? e.message : String(e);
    for (const a of liste) msg = msg.split(a).join("[Adresse]");
    msg = msg.replace(/[^\s@]+@[^\s@]+/g, "[Adresse]");
    reportError(new Error(msg), "vertrieb-art17-instantly");
    return { ok: false, fehler: msg.slice(0, 300) };
  }
}

type Opts = {
  /** antwort: Antwort per Mail; admin: Knopf in der Kontaktakte; loeschprotokoll: erneut nach Wiederherstellung */
  quelle: "antwort" | "admin" | "loeschprotokoll";
  /** Eingang des Verlangens (Frist der Aufgaben) */
  eingang?: Date;
  /** dieselbe Antwort fragt auch nach Auskunft (Art. 15): erst Auskunft, dann löschen (Aufgabe) */
  auskunftOffen?: boolean;
  /** Sperrgrund, falls der Kontakt noch nicht gesperrt ist */
  grund?: SperrGrund;
  now?: Date;
  actor?: AuditActor;
};

/**
 * Vertriebskontakt auf Verlangen löschen (Art. 17). Wirft nicht wegen Instantly; Datenbankfehler werden geworfen.
 */
export async function vertriebArt17Loeschen(contactId: string, opts: Opts): Promise<Art17Ergebnis> {
  const now = opts.now ?? new Date();
  const eingang = opts.eingang ?? now;
  const c = await prisma.salesContact.findUnique({ where: { id: contactId }, select: { email: true, altEmails: true, art17GeloeschtAt: true, nieKontaktierenAt: true, nieKontaktierenGrund: true } });
  if (!c) return { status: "nicht_gefunden" };
  if (c.art17GeloeschtAt) return { status: "schon_geloescht" };
  const ausLoeschprotokoll = opts.quelle === "loeschprotokoll";

  if (!ausLoeschprotokoll) {
    // Sperrvermerk zuerst (idempotent); Instantly-Sperre folgt unten bzw. im Cron
    if (!c.nieKontaktierenAt) await nieKontaktierenSetzen(contactId, opts.grund ?? "widerspruch", { at: eingang, quelle: opts.quelle === "admin" ? "Löschverlangen, von Hand" : "Löschverlangen per Mail", instantly: false, now });

    if (opts.auskunftOffen) {
      await aufgabe(contactId, AUSKUNFT_VOR_LOESCHUNG_AUFGABE, eingang, now, "Der Kontakt verlangt Auskunft und Löschung. Erst die Auskunft schicken (Diagnose q=vertrieb-auskunft), dann in der Kontaktakte unter „Mehr“ „Auf Verlangen löschen (Art. 17)“ wählen. Der Kontakt ist gesperrt.");
      await audit("vertrieb.art17_auskunft_zuerst", { entity: "SalesContact", entityId: contactId, actor: opts.actor });
      return { status: "auskunft_zuerst" };
    }

    // Ausnahmen über alle Kontakte mit derselben Adresse (Kunde, Lead eines Kunden, PPL-Bezieher mit Login, Angebot …)
    const weitere = await weitereKontakte(contactId, await adressen(contactId, c));
    const gruende = [...new Set((await Promise.all([contactId, ...weitere].map(art17Ausnahmen))).flat())];
    if (gruende.length) {
      for (const id of weitere) await nieKontaktierenSetzen(id, opts.grund ?? "widerspruch", { at: eingang, quelle: "Löschverlangen (gleiche Adresse)", instantly: false, now });
      await aufgabe(
        contactId,
        LOESCH_PRUEFEN_AUFGABE,
        eingang,
        now,
        `Löschverlangen, aber nicht automatisch gelöscht: ${gruende.map((g) => ART17_AUSNAHME_LABEL[g]).join(", ")}. Prüfen, was gelöscht werden darf (Vertrag, Aufbewahrung), und dem Kontakt antworten. Der Kontakt ist gesperrt.`,
      );
      await audit("vertrieb.art17_ausnahme", { entity: "SalesContact", entityId: contactId, details: { gruende }, actor: opts.actor });
      return { status: "ausnahme", gruende };
    }
  }

  const liste = await adressen(contactId, c);
  const hashes = [...new Set(liste.map(emailHash))];
  // „Überall“ (Ole, 19.11.2026): weitere Vertriebskontakte mit dieser Adresse (Haupt- oder Zusatzadresse) ganz löschen
  // (nur die Adressen des Verlangens werden gesperrt, nicht weitere Adressen dieser Kontakte, z. B. eine Sammeladresse)
  const weitere = ausLoeschprotokoll ? [] : await weitereKontakte(contactId, liste);
  let instantly: Art17Ergebnis["instantly"] = "uebersprungen";
  let fehler: string | null = null;
  if (!ausLoeschprotokoll) {
    if (!instantlySchreibbar()) instantly = "aus";
    else {
      const r = await instantlyLoeschen(liste);
      instantly = r.ok ? "erledigt" : "fehler";
      if (!r.ok) fehler = r.fehler;
    }
  }

  await huelleSchreiben(contactId, hashes, c.nieKontaktierenAt ?? eingang, c.nieKontaktierenGrund ?? opts.grund ?? "widerspruch", now);
  for (const id of weitere) await kontaktGanzLoeschen(id);

  if (fehler) {
    await prisma.salesTask.create({
      data: {
        contactId,
        title: INSTANTLY_AUFGABE,
        type: "SONSTIGES",
        dueAt: now,
        note: `Instantly war nicht erreichbar (${fehler}). Lokal ist alles gelöscht. In Instantly die Antwort vom ${eingang.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })} im Postfach suchen, den Lead in allen Kampagnen löschen und die Adresse auf die Blocklist setzen.`,
      },
    });
  }
  if (!ausLoeschprotokoll) {
    // Die App schreibt nicht ins alte Cold CRM (nur Lese-Import): dort von Hand löschen
    await prisma.salesTask.create({
      data: {
        contactId,
        title: aufgabeMitFrist(COLD_CRM_AUFGABE, eingang),
        type: "SONSTIGES",
        dueAt: now,
        note: "Die App hat alles gelöscht. Im alten Cold CRM bzw. Airtable den Kontakt aus der Löschanfrage (Adresse im Postfach) ebenfalls löschen, falls er dort noch steht.",
      },
    });
    const { protokolliereLoeschung } = await import("@/lib/loeschprotokoll");
    await protokolliereLoeschung(
      [{ art: "vertriebskontakt_art17", entityId: contactId, grund: "art17" }, ...weitere.map((id) => ({ art: "vertriebskontakt" as const, entityId: id, grund: "art17" }))],
      now,
    );
  }
  await audit("vertrieb.geloescht_art17", {
    entity: "SalesContact",
    entityId: contactId,
    details: { datum: now.toISOString().slice(0, 10), quelle: opts.quelle, instantly, weitereKontakte: weitere.length },
    actor: opts.actor ?? (opts.quelle === "admin" ? undefined : { role: "system" }),
  });
  return { status: "geloescht", instantly };
}

/** Weitere Vertriebskontakte mit einer dieser Adressen (Haupt- oder Zusatzadresse), ohne Hüllen. */
async function weitereKontakte(contactId: string, liste: string[]): Promise<string[]> {
  if (!liste.length) return [];
  const rows = await prisma.salesContact.findMany({
    where: { id: { not: contactId }, art17GeloeschtAt: null, OR: [{ email: { in: liste, mode: "insensitive" } }, { altEmails: { hasSome: liste } }] },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Weiteren Kontakt mit derselben Adresse ganz löschen (auch Eingänge, deren Verweis sonst nur geleert würde). */
async function kontaktGanzLoeschen(id: string) {
  await prisma.$transaction([
    prisma.salesLinkedInEvent.deleteMany({ where: { contactId: id } }),
    prisma.salesInboundLead.deleteMany({ where: { contactId: id } }),
    prisma.conversation.deleteMany({ where: { salesContactId: id } }),
    prisma.salesContact.delete({ where: { id } }),
  ]);
}

/** Personenbezug entfernen, Hülle mit Sperrvermerk und einem Verlaufseintrag schreiben (eine Transaktion). */
async function huelleSchreiben(contactId: string, hashes: string[], gesperrtAt: Date, grund: string, now: Date) {
  const where = { contactId };
  await prisma.$transaction([
    prisma.salesActivity.deleteMany({ where }),
    prisma.salesTask.deleteMany({ where: { contactId, NOT: BLEIBENDE_AUFGABEN } }),
    prisma.salesEmail.deleteMany({ where }),
    prisma.salesFollowup.deleteMany({ where }),
    prisma.salesCampaignLead.deleteMany({ where }),
    prisma.salesMeeting.deleteMany({ where }),
    prisma.salesContactPhone.deleteMany({ where }),
    prisma.salesPresentationLink.deleteMany({ where }),
    prisma.salesLinkedInEvent.deleteMany({ where }),
    prisma.salesInboundLead.deleteMany({ where }),
    prisma.conversation.deleteMany({ where: { salesContactId: contactId } }),
    prisma.salesContact.update({
      where: { id: contactId },
      data: {
        name: ART17_NAME,
        email: art17Email(contactId),
        altEmails: [],
        sperrHashes: { set: hashes },
        art17GeloeschtAt: now,
        nieKontaktierenAt: gesperrtAt,
        nieKontaktierenGrund: grund,
        // Instantly ist erledigt bzw. als Aufgabe offen: der Cron soll die Ersatzadresse nicht sperren
        instantlyGesperrtAt: now,
        instantlySperreVersuche: 0,
        instantlySperreFehler: null,
        phone: null, fax: null, street: null, zip: null, city: null,
        ratingValue: null, ratingCount: null, openingHours: null, url: null, description: null,
        googlePlaceId: null, googleMapsUrl: null, businessStatus: null, insurer: null,
        salutation: null, firstName: null, lastName: null, leaderNames: null, agencyType: null, teamSize: null, potentialScore: null,
        facebookUrl: null, instagramUrl: null, xingUrl: null, linkedinUrl: null,
        linkedinStatus: null, linkedinRequestAt: null, linkedinConnectedAt: null, linkedinMessageAt: null, linkedinReplyAt: null, linkedinList: null, linkedinTags: null,
        competitor: null, legacyStatus: null, products: null, monthlyValue: null, customerSource: null, customerSourceNote: null,
        whatsappErlaubt: null, whatsappErlaubtAt: null,
        lastContactAt: null, callAttempts: 0,
      },
    }),
    // JSON-Felder auf SQL-NULL (Prisma braucht dafür DbNull)
    prisma.$executeRaw`UPDATE "SalesContact" SET "enrichment" = NULL, "detectedData" = NULL WHERE "id" = ${contactId}`,
    prisma.salesActivity.create({ data: { contactId, type: "NOTIZ", outcome: ART17_NAME, note: art17Vermerk(now), occurredAt: now } }),
  ]);
}

/**
 * Nach einer Wiederherstellung oder einem Import mit alten IDs (Cold CRM): Hüllen erneut bereinigen, falls dort wieder
 * Verlauf, Mails oder Aufgaben hängen. Liefert die Zahl bereinigter Hüllen.
 */
export async function art17HuellenBereinigen(now = new Date()): Promise<number> {
  const huellen = await prisma.salesContact.findMany({ where: { art17GeloeschtAt: { not: null } }, select: { id: true, sperrHashes: true, nieKontaktierenAt: true, nieKontaktierenGrund: true, art17GeloeschtAt: true, name: true } });
  let n = 0;
  for (const h of huellen) {
    const fremd = await prisma.salesActivity.count({ where: { contactId: h.id, NOT: { outcome: ART17_NAME } } });
    const rest = fremd + (await prisma.salesEmail.count({ where: { contactId: h.id } })) + (await prisma.salesTask.count({ where: { contactId: h.id, NOT: BLEIBENDE_AUFGABEN } }));
    if (!rest && h.name === ART17_NAME) continue;
    await huelleSchreiben(h.id, h.sperrHashes, h.nieKontaktierenAt ?? h.art17GeloeschtAt!, h.nieKontaktierenGrund ?? "widerspruch", h.art17GeloeschtAt ?? now);
    n++;
  }
  return n;
}


/** Antwort an eine Hülle (Art. 17): Inhalt nicht speichern, Ole liest sie im Instantly-Postfach. */
export async function art17NeueNachricht(contactId: string, at: Date, now = new Date()): Promise<boolean> {
  const schon = await prisma.salesTask.findFirst({ where: { contactId, doneAt: null, title: { startsWith: NACHRICHT_AUFGABE } }, select: { id: true } });
  if (schon) return false;
  await prisma.salesTask.create({
    data: {
      contactId,
      title: NACHRICHT_AUFGABE,
      type: "SONSTIGES",
      dueAt: now,
      note: `Antwort vom ${at.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })} im Instantly-Postfach lesen. Die App speichert keine Inhalte dieses Kontakts mehr (Art. 17).`,
    },
  });
  return true;
}
