// Auskunft nach Art. 15 DSGVO für Vertriebskontakte (Ole, 19.11.2026), nur lesend über die Diagnose-API:
//   q=vertrieb-auskunft&email=<adresse> bzw. &id=<kontakt-id>  alles, was Ole für die Antwort braucht: Anrede, Name,
//       Firma, gespeicherte Felder, Herkunft, Empfänger, Mails an den Kontakt, Sperrstatus (und ob danach noch etwas rausging)
//   q=vertrieb-auskunft&suche=<Teil des Namens>  nur ID, Name, Firma, Status (höchstens 10)
//   q=vertrieb-dsgvo[&tage=60]  nur Anzahl der Antworten mit Datenschutz- bzw. Widerspruchsbezug
// Ohne Treffer kommt nichts zurück (auch keine Hinweise, ob es die Adresse gibt). Auf Verlangen gelöschte Kontakte
// (Art. 17) werden über den Hash gefunden und zeigen nur den Löschvermerk.

import { prisma } from "@/lib/prisma";
import { findContactIdByEmail } from "@/lib/vertrieb/contact-merge";
import { geloeschterKontaktId } from "@/lib/vertrieb/sperrliste";
import { ANREICHERUNG_LABEL } from "@/lib/vertrieb/contact-enrich";
import { dsgvoAusAntwort, SPERR_GRUND_LABEL, istSperrGrund } from "@/lib/vertrieb/nie-kontaktieren";
import { LOSS_LABEL, STAGE_LABEL } from "@/lib/vertrieb/crm";

/** Gespeicherte Felder mit Bezeichnung (Reihenfolge der Ausgabe). Technische Felder (IDs, Zähler, Prüfzeitpunkte) fehlen. */
const FELDER: [string, string][] = [
  ["salutation", "Anrede"], ["firstName", "Vorname"], ["lastName", "Nachname"], ["name", "Firma bzw. Name"], ["leaderNames", "Inhaber bzw. Geschäftsführer"],
  ["email", "E-Mail"], ["altEmails", "weitere E-Mail-Adressen"], ["phone", "Telefon"],
  ["street", "Straße"], ["zip", "PLZ"], ["city", "Ort"], ["url", "Website"], ["description", "Beschreibung"], ["insurer", "Versicherer"],
  ["agencyType", "Agenturtyp"], ["teamSize", "Teamgröße"], ["openingHours", "Öffnungszeiten"], ["ratingValue", "Google-Bewertung"], ["ratingCount", "Anzahl Google-Bewertungen"],
  ["googleMapsUrl", "Google-Maps-Eintrag"], ["businessStatus", "Google-Geschäftsstatus"],
  ["facebookUrl", "Facebook"], ["instagramUrl", "Instagram"], ["xingUrl", "Xing"], ["linkedinUrl", "LinkedIn"],
  ["linkedinStatus", "LinkedIn-Status"], ["stage", "Status bei uns"], ["lossReason", "Grund"], ["competitor", "Wettbewerber"],
  ["lastContactAt", "letzter Kontakt"], ["legacyStatus", "Status aus der alten Anrufliste"], ["products", "Produkte"], ["createdAt", "angelegt am"],
];

type Json = Record<string, unknown> | null;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const tag = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

async function kontaktId(params: URLSearchParams): Promise<{ id: string; geloescht: boolean } | null> {
  const id = (params.get("id") ?? "").trim();
  if (id) {
    const c = await prisma.salesContact.findUnique({ where: { id }, select: { id: true, art17GeloeschtAt: true } });
    return c ? { id: c.id, geloescht: !!c.art17GeloeschtAt } : null;
  }
  const email = (params.get("email") ?? "").trim().toLowerCase();
  if (!email.includes("@")) return null;
  const direkt = await findContactIdByEmail(email);
  if (direkt) return { id: direkt, geloescht: false };
  const huelle = await geloeschterKontaktId(email);
  return huelle ? { id: huelle, geloescht: true } : null;
}

/** Herkunft: Import aus einer öffentlichen Liste (enrichment.import), sonst laut Verlauf, Instantly oder Cold CRM. */
function herkunft(c: { enrichment: unknown; description: string | null; legacyStatus: string | null; createdAt: Date }, importe: { note: string | null; occurredAt: Date }[]) {
  const e = obj(c.enrichment);
  const imp = obj(e?.import);
  if (imp) {
    return {
      art: "öffentliche Vermittlerliste",
      quelle: imp.quelle ?? null,
      gesellschaft: imp.gesellschaft ?? null,
      emailQuelle: imp.emailQuelle ?? null,
      quelleUrl: imp.quelleUrl ?? null,
      abgerufenAm: imp.abgerufenAm ?? null,
      importiertAm: imp.importiertAm ?? null,
    };
  }
  const verlauf = importe.map((i) => ({ datum: tag(i.occurredAt), notiz: i.note }));
  const ergaenzt = ergaenztAus(e);
  if (c.description?.startsWith("Über Instantly angelegt")) return { art: "Instantly (Liste direkt in Instantly hochgeladen)", angelegt: tag(c.createdAt), verlauf, ergaenzt };
  if (verlauf.length) return { art: "laut Verlauf", angelegt: tag(c.createdAt), verlauf, ergaenzt };
  return { art: c.legacyStatus ? "Import Cold CRM (alte Anrufliste)" : "Import Cold CRM bzw. von Hand angelegt", angelegt: tag(c.createdAt), ergaenzt };
}

/** Verlaufseinträge zu automatisch übernommenen Kontaktdaten (Telefon, E-Mail, Webseite, Google), für die Herkunft. */
async function ergaenztVerlauf(contactId: string): Promise<string[]> {
  const rows = await prisma.salesActivity.findMany({
    where: { contactId, OR: [{ note: { startsWith: "Automatisch ergänzt" } }, { outcome: { in: ["Neue Telefonnummer erkannt", "Neue E-Mail-Adresse erkannt"] } }, { note: { startsWith: "Adresse von der Website ergänzt" } }] },
    orderBy: { occurredAt: "asc" },
    select: { note: true, occurredAt: true },
  });
  return rows
    .map((r) => (r.note ?? "").replace(/^Automatisch ergänzt:\s*/, "").replace(/, als Hauptnummer übernommen$/, "").replace(/\.$/, "").trim())
    .map((n, i) => (n ? `${n} (am ${rows[i].occurredAt.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" })})` : ""))
    .filter(Boolean);
}

/** Automatisch ergänzte Felder (Webseite bzw. Google-Unternehmensprofil) mit Quelle und Datum, für die Herkunft. */
function ergaenztAus(e: Record<string, unknown> | null) {
  const out: { quelle: "webseite" | "google"; url: string | null; am: string | null; felder: string[] }[] = [];
  const felder = (v: unknown) =>
    (Array.isArray(v) ? v : []).filter((f): f is string => typeof f === "string" && !["googlePlaceId", "ratingCount", "businessStatus"].includes(f)).map((f) => ANREICHERUNG_LABEL[f] ?? f);
  const w = obj(e?.website);
  if (w && felder(w.fields).length) out.push({ quelle: "webseite", url: typeof w.url === "string" ? w.url : null, am: typeof w.at === "string" ? w.at.slice(0, 10) : null, felder: felder(w.fields) });
  const g = obj(e?.google);
  if (g && felder(g.fields).length) out.push({ quelle: "google", url: null, am: typeof g.at === "string" ? g.at.slice(0, 10) : null, felder: felder(g.fields) });
  return out;
}

export async function vertriebAuskunftDiagnose(params: URLSearchParams) {
  const suche = (params.get("suche") ?? "").trim();
  if (suche) {
    if (suche.length < 3) return { treffer: [] };
    const { kontaktSucheWhere } = await import("@/lib/vertrieb/suche");
    const rows = await prisma.salesContact.findMany({
      where: kontaktSucheWhere(suche),
      take: 10,
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, firstName: true, lastName: true, stage: true, nieKontaktierenAt: true, art17GeloeschtAt: true },
    });
    return {
      treffer: rows.map((r) => ({
        id: r.id,
        name: [r.firstName, r.lastName].filter(Boolean).join(" ") || null,
        firma: r.name,
        status: r.art17GeloeschtAt ? "auf Verlangen gelöscht" : r.nieKontaktierenAt ? `${STAGE_LABEL[r.stage]}, nie kontaktieren` : STAGE_LABEL[r.stage],
      })),
    };
  }

  const k = await kontaktId(params);
  if (!k) return { gefunden: false };
  if (k.geloescht) {
    const h = await prisma.salesContact.findUniqueOrThrow({ where: { id: k.id }, select: { id: true, art17GeloeschtAt: true, nieKontaktierenAt: true, nieKontaktierenGrund: true } });
    return {
      gefunden: true,
      id: h.id,
      geloeschtAufVerlangen: tag(h.art17GeloeschtAt),
      hinweis: "Personenbezogene Daten auf Verlangen gelöscht (Art. 17 DSGVO). Gespeichert ist nur noch der Sperrvermerk mit dem Hash der Adresse.",
      sperre: { seit: tag(h.nieKontaktierenAt), grund: istSperrGrund(h.nieKontaktierenGrund) ? SPERR_GRUND_LABEL[h.nieKontaktierenGrund] : h.nieKontaktierenGrund },
    };
  }

  const c = await prisma.salesContact.findUniqueOrThrow({
    where: { id: k.id },
    include: {
      phones: { select: { phone: true, source: true } },
      campaigns: { select: { sentAt: true, status: true, campaign: { select: { name: true } } } },
      emails: { orderBy: { sentAt: "asc" }, select: { direction: true, sentAt: true, campaign: true, subject: true, isAutoReply: true } },
      activities: { where: { type: "IMPORT" }, orderBy: { occurredAt: "asc" }, select: { note: true, occurredAt: true } },
      followups: { select: { mail1SentAt: true, mail2SentAt: true } },
      meetings: { select: { startAt: true } },
      _count: { select: { supportConversations: true, offers: true } },
    },
  });

  const rec = c as unknown as Record<string, unknown>;
  const felder: Record<string, unknown> = {};
  for (const [f, label] of FELDER) {
    const v = rec[f];
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) continue;
    // Klartext statt interner Kürzel (Ole, 24.11.2026: „KEIN_INTERESSE“ stand so in der Auskunft)
    felder[label] = v instanceof Date ? tag(v) : f === "stage" ? STAGE_LABEL[v as keyof typeof STAGE_LABEL] : f === "lossReason" ? (LOSS_LABEL[v as keyof typeof LOSS_LABEL] ?? v) : v;
  }
  if (c.phones.length) felder["weitere Telefonnummern"] = c.phones.map((p) => p.phone);

  // Mails an den Kontakt: gespeicherte (Später-Follow-up, von Hand), Follow-up-Schritte, Kampagnen-Versand laut Instantly
  const raus: { datum: string | null; weg: string }[] = [
    ...c.emails.filter((e) => e.direction === "OUT").map((e) => ({ datum: tag(e.sentAt), weg: e.campaign ? `Mail (${e.campaign})` : "Mail aus der App" })),
    ...c.followups.flatMap((f) => [f.mail1SentAt, f.mail2SentAt].filter((d): d is Date => !!d).map((d) => ({ datum: tag(d), weg: "Später-Follow-up" }))),
    ...c.campaigns.filter((l) => l.sentAt).map((l) => ({ datum: tag(l.sentAt), weg: `Instantly-Kampagne „${l.campaign.name}“ (letzte bekannte Mail)` })),
  ];
  let instantly: unknown = null;
  if (process.env.INSTANTLY_API_KEY) {
    const { listEmails } = await import("@/lib/vertrieb/instantly");
    instantly = await listEmails(new URLSearchParams({ lead: c.email, limit: "100", sort_order: "asc" }))
      .then((page) => page.items.map((e) => ({ datum: (e.timestamp_email || e.timestamp_created || "").slice(0, 10), richtung: e.ue_type === 2 ? "eingehend" : "ausgehend" })))
      .catch((e: unknown) => ({ fehler: e instanceof Error ? e.message.slice(0, 200) : "Fehler" }));
    if (Array.isArray(instantly)) for (const m of instantly as { datum: string; richtung: string }[]) if (m.richtung === "ausgehend") raus.push({ datum: m.datum, weg: "Instantly (laut Instantly)" });
  }
  raus.sort((a, b) => String(a.datum).localeCompare(String(b.datum)));

  const empfaenger = [
    ...(c.campaigns.length || instantly ? [`Instantly (Versand der Kampagnen-Mails, Auftragsverarbeiter): ${c.campaigns.map((l) => l.campaign.name).join(", ") || "ohne Kampagne im CRM"}`] : []),
    ...(c.googleCheckedAt || c.googlePlaceId ? ["Google (Abfrage der Firmendaten über Google Places)"] : []),
    ...(c.meetings.length ? ["Kalender bzw. Calendly (Terminbuchung)"] : []),
    ...(c._count.supportConversations ? ["WhatsApp über 360dialog (Support-Nummer)"] : []),
  ];

  // Für die Antwortvorlage (lib/vertrieb/datenschutz-recht.ts vorlageAuskunft): weitere Empfänger aus der Akte
  const empfaengerArten = [
    ...(c.googleCheckedAt || c.googlePlaceId ? (["google"] as const) : []),
    ...(c.meetings.length ? (["kalender"] as const) : []),
    ...(c._count.supportConversations ? (["whatsapp"] as const) : []),
  ];

  const sperreSeit = c.nieKontaktierenAt;
  const nachSperre = sperreSeit ? raus.filter((m) => m.datum && m.datum > tag(sperreSeit)!) : [];
  return {
    gefunden: true,
    id: c.id,
    anrede: c.salutation,
    vorname: c.firstName,
    nachname: c.lastName,
    firma: c.name,
    felder,
    herkunft: { ...herkunft(c, c.activities), ergaenztVerlauf: await ergaenztVerlauf(c.id) },
    empfaenger,
    empfaengerArten,
    mailsAnIhn: raus,
    antwortenVonIhm: c.emails.filter((e) => e.direction === "IN" && !e.isAutoReply).map((e) => tag(e.sentAt)),
    sperre: sperreSeit
      ? {
          seit: tag(sperreSeit),
          grund: istSperrGrund(c.nieKontaktierenGrund) ? SPERR_GRUND_LABEL[c.nieKontaktierenGrund] : c.nieKontaktierenGrund,
          instantlyGesperrt: tag(c.instantlyGesperrtAt),
          nachDerSperreRaus: nachSperre,
        }
      : null,
    angebote: c._count.offers,
  };
}

/** Anzahl der Antworten mit Datenschutz- bzw. Widerspruchsbezug in den letzten N Tagen (1 bis 365, Standard 60). */
export async function vertriebDsgvoDiagnose(params: URLSearchParams) {
  const tage = Math.min(365, Math.max(1, Math.round(Number(params.get("tage") ?? 60)) || 60));
  const seit = new Date(Date.now() - tage * 86400000);
  const out = { tage, antworten: 0, mitBezug: 0, datenschutz: 0, widerspruch: 0, loeschverlangen: 0 };
  let cursor: string | undefined;
  for (;;) {
    const page = await prisma.salesEmail.findMany({
      where: { direction: "IN", isAutoReply: false, sentAt: { gte: seit } },
      orderBy: { id: "asc" },
      take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, text: true, subject: true },
    });
    if (!page.length) break;
    cursor = page[page.length - 1].id;
    for (const m of page) {
      out.antworten++;
      const b = dsgvoAusAntwort(m.text, m.subject);
      if (b.grund === "datenschutz") out.datenschutz++;
      if (b.grund === "widerspruch") out.widerspruch++;
      if (b.loeschen) out.loeschverlangen++;
      if (b.grund === "datenschutz" || b.grund === "widerspruch") out.mitBezug++;
    }
  }
  return out;
}
