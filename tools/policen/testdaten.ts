// Testdaten für das Modul „Policen auslesen“ (UX-Prüfung, Screenshots, Playwright). NUR lokale Datenbank.
//   npx vite-node --config vitest.config.ts tools/policen/testdaten.ts
// Legt idempotent an (feste IDs, upsert): Vermittler-Kunde „Agentur Policen Test“ mit Login policen@test.local /
// Test1234!test (Inhaber), Bestandskunden-Modul sichtbar, sechs Leads mit Terminen in verschiedenen Zuständen:
//   1 Lena Vogt       Bitte gesendet, keine Antwort (keine Unterlagen)
//   2 Markus Brandt   Einwilligung ohne KI („ohne KI“), zwei Unterlagen, nichts ausgelesen
//   3 Julia Schneider Einwilligung mit KI, sechs ausgelesene Unterlagen (Haftpflicht doppelt, Hausrat ohne Elementar,
//                     Kfz mit Kündigungstermin, Wohngebäude, Rechtsschutz, unsichere Felder), Termin in 2 Stunden
//   4 Thomas Weber    Einwilligung mit KI, eine Unterlage ausgelesen, eine mit unklarer Sparte, eine BU (gesperrt)
//   5 Sabine Krüger   Haftpflicht geprüft und in den Bestand übernommen, Hausrat geprüft (noch nicht übernommen)
//   6 Peter Hoffmann  Termin ohne Bitte und ohne Unterlagen (leerer Zustand)
// Auslese-Ergebnisse werden direkt geschrieben (keine KI-Aufrufe). Unterlagen liegen in der alten Ablage (verschlüsselt
// in der Datenbank, ENCRYPTION_KEY); ohne gesetzten Schlüssel nimmt das Skript einen festen Test-Schlüssel, den der
// lokale Dev-Server dann ebenfalls braucht. Pseudodaten, keine echten Personen.
//
// Dev-Server mit Policen-Funktion (nur Platzhalter, keine echten Zugänge; Auslesen nie anstoßen, sonst Aufruf beim Anbieter):
//   ENCRYPTION_KEY=<wie unten> POLICEN_S3_ENDPOINT=https://test123.eu.r2.cloudflarestorage.com POLICEN_S3_BUCKET=x \
//   POLICEN_S3_ACCESS_KEY_ID=x POLICEN_S3_SECRET_ACCESS_KEY=x POLICEN_SCHLUESSEL=<32 Byte base64> \
//   POLICEN_OPENAI_API_KEY=platzhalter npx next dev -p 3401 --webpack

import { PDFDocument, StandardFonts } from "pdf-lib";

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url) && !/host=\/tmp/.test(url)) {
  console.error("Abbruch: DATABASE_URL zeigt nicht auf localhost. Testdaten nur lokal.");
  process.exit(1);
}
/** Fester Test-Schlüssel (kein Geheimnis, wie in den Integrationstests). */
export const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.ENCRYPTION_KEY ||= TEST_ENCRYPTION_KEY;

const { prisma } = await import("@/lib/prisma");
const { encryptBytes } = await import("@/lib/encryption");
const { hashPassword } = await import("@/lib/auth");

const C = "pgp-kunde";
const U = "pgp-user-inhaber";
const EMAIL = "policen@test.local";
const PASSWORT = "Test1234!test";
const now = new Date();
const H = 3_600_000;
const D = 24 * H;

/** Termin zur vollen Viertelstunde, Abstand in Stunden ab jetzt. */
const termin = (inStunden: number) => {
  const d = new Date(now.getTime() + inStunden * H);
  d.setUTCMinutes(Math.ceil(d.getUTCMinutes() / 15) * 15 % 60, 0, 0);
  return d;
};

async function pdf(zeilen: string[]): Promise<Buffer> {
  const d = await PDFDocument.create();
  const font = await d.embedFont(StandardFonts.Helvetica);
  const p = d.addPage([595, 842]);
  zeilen.forEach((z, i) => p.drawText(z, { x: 50, y: 780 - i * 22, size: 12, font }));
  return Buffer.from(await d.save());
}

type F = Record<string, { w: string | number | boolean | string[]; s: "ok" | "pruefen" | "korrigiert" }>;
const ok = (o: Record<string, string | number | boolean | string[]>, pruefen: string[] = []): F =>
  Object.fromEntries(Object.entries(o).map(([k, w]) => [k, { w, s: pruefen.includes(k) ? "pruefen" : "ok" }]));

type Doc = {
  id: string;
  fileName: string;
  sparte: string | null;
  zeilen: string[];
  mime?: string;
  gesundheit?: boolean;
  auszug?: { status: string; sparte: string | null; quelle?: string | null; felder?: F; geprueft?: boolean };
};
type LeadDef = {
  n: number;
  name: string;
  phone: string;
  email: string;
  source: string;
  inStunden: number;
  mode: "video" | "phone";
  bitte: boolean;
  nachweis: null | { art: string; ki: boolean | null; version: string }[];
  docs: Doc[];
};

const vNr = (s: string) => `…${s}`;

const LEADS: LeadDef[] = [
  { n: 1, name: "Lena Vogt", phone: "4915200000101", email: "lena.vogt@example.com", source: "Privathaftpflicht", inStunden: 26, mode: "video", bitte: true, nachweis: null, docs: [] },
  {
    n: 2,
    name: "Markus Brandt",
    phone: "4915200000102",
    email: "markus.brandt@example.com",
    source: "Hausrat",
    inStunden: 30,
    mode: "phone",
    bitte: true,
    nachweis: [
      { art: "einwilligung", ki: false, version: "2026-11-18.s2" },
      { art: "ohne_ki", ki: null, version: "2026-11-18.s2" },
    ],
    docs: [
      { id: "pgp-doc-2a", fileName: "Haftpflicht Brandt.pdf", sparte: "haftpflicht", zeilen: ["Versicherungsschein Privathaftpflicht", "Musterhafte Versicherung AG"] },
      { id: "pgp-doc-2b", fileName: "IMG_4711.jpg", sparte: null, zeilen: ["Hausratversicherung Nachtrag"], mime: "application/pdf" },
    ],
  },
  {
    n: 3,
    name: "Julia Schneider",
    phone: "4915200000103",
    email: "julia.schneider@example.com",
    source: "Privatschutz",
    inStunden: 2,
    mode: "video",
    bitte: true,
    nachweis: [{ art: "einwilligung", ki: true, version: "2026-11-18.s2" }],
    docs: [
      {
        id: "pgp-doc-3a",
        fileName: "Haftpflicht HUK.pdf",
        sparte: "haftpflicht",
        zeilen: ["Versicherungsschein Privathaftpflicht", "HUK-Coburg", "Familie"],
        auszug: {
          status: "ausgelesen",
          sparte: "haftpflicht",
          quelle: "unterlage",
          felder: ok({ versicherer: "HUK-Coburg", tarifname: "Privathaftpflicht Basis", versicherungsnummer: vNr("4471"), beitrag: 68.5, zahlweise: "jaehrlich", beginn: "2019-04-01", ablauf: "2027-04-01", kuendigungsfrist_monate: 3, selbstbeteiligung: 150, deckungssumme: 5000000, umfang: "familie", schluesselverlust: true, forderungsausfall: false }),
        },
      },
      {
        id: "pgp-doc-3b",
        fileName: "Hausrat Allianz.pdf",
        sparte: "hausrat",
        zeilen: ["Hausratversicherung", "Allianz Versicherungs-AG"],
        auszug: {
          status: "ausgelesen",
          sparte: "hausrat",
          quelle: "unterlage",
          felder: ok(
            { versicherer: "Allianz", tarifname: "Hausrat Smart", versicherungsnummer: vNr("8820"), beitrag: 14.9, zahlweise: "monatlich", beginn: "2021-03-01", ablauf: "2027-03-01", kuendigungsfrist_monate: 1, selbstbeteiligung: 0, versicherungssumme: 52000, wohnflaeche: 80, unterversicherungsverzicht: true, elementar: false, fahrrad: false },
            ["wohnflaeche", "versicherungssumme"],
          ),
        },
      },
      {
        id: "pgp-doc-3c",
        fileName: "Kfz Beitragsrechnung 2026.pdf",
        sparte: "kfz",
        zeilen: ["Kfz-Versicherung Beitragsrechnung 2026", "DEVK"],
        auszug: {
          status: "ausgelesen",
          sparte: "kfz",
          quelle: "unterlage",
          felder: ok(
            { versicherer: "DEVK", tarifname: "Kfz Komfort", versicherungsnummer: vNr("3307"), beitrag: 812.4, zahlweise: "jaehrlich", beginn: "2022-01-01", ablauf: "2027-01-01", kuendigungsfrist_monate: 1, naechster_kuendigungstermin: "2027-01-01", selbstbeteiligung: 300, sf_haftpflicht: "SF 12", sf_kasko: "SF 9", kasko: "vollkasko", fahrleistung: 12000, werkstattbindung: false },
            ["sf_kasko"],
          ),
        },
      },
      {
        id: "pgp-doc-3d",
        fileName: "Wohngebaeude.pdf",
        sparte: "wohngebaeude",
        zeilen: ["Wohngebäudeversicherung", "Provinzial"],
        auszug: {
          status: "ausgelesen",
          sparte: "wohngebaeude",
          quelle: "text",
          felder: ok({ versicherer: "Provinzial", tarifname: "Wohngebäude Top", versicherungsnummer: vNr("1290"), beitrag: 486, zahlweise: "jaehrlich", beginn: "2016-07-01", ablauf: "2027-07-01", kuendigungsfrist_monate: 3, selbstbeteiligung: 500, versicherungssumme: 420000, wert_1914: 21500, elementar: false }, ["wert_1914"]),
        },
      },
      {
        id: "pgp-doc-3e",
        fileName: "Haftpflicht alt Ergo.pdf",
        sparte: "haftpflicht",
        zeilen: ["Privathaftpflichtversicherung", "ERGO Versicherung AG", "Single"],
        auszug: {
          status: "ausgelesen",
          sparte: "haftpflicht",
          quelle: "unterlage",
          felder: ok({ versicherer: "ERGO", tarifname: "Haftpflicht Smart", versicherungsnummer: vNr("0915"), beitrag: 5.2, zahlweise: "monatlich", beginn: "2012-09-01", ablauf: "2026-09-01", kuendigungsfrist_monate: 3, deckungssumme: 3000000, umfang: "single" }, ["umfang"]),
        },
      },
      {
        id: "pgp-doc-3f",
        fileName: "Rechtsschutz ARAG.pdf",
        sparte: "rechtsschutz",
        zeilen: ["Rechtsschutzversicherung", "ARAG SE"],
        auszug: {
          status: "ausgelesen",
          sparte: "rechtsschutz",
          quelle: "unterlage",
          felder: ok({ versicherer: "ARAG", tarifname: "Aktiv-Rechtsschutz Komfort", versicherungsnummer: vNr("5512"), beitrag: 29.8, zahlweise: "monatlich", beginn: "2020-02-01", ablauf: "2027-02-01", kuendigungsfrist_monate: 3, selbstbeteiligung: 150, bausteine: ["privat", "beruf", "verkehr"] }),
        },
      },
    ],
  },
  {
    n: 4,
    name: "Thomas Weber",
    phone: "4915200000104",
    email: "thomas.weber@example.com",
    source: "Hausrat",
    inStunden: 50,
    mode: "video",
    bitte: true,
    nachweis: [{ art: "einwilligung", ki: true, version: "2026-11-18.g2" }],
    docs: [
      {
        id: "pgp-doc-4a",
        fileName: "Hausrat Weber.pdf",
        sparte: "hausrat",
        zeilen: ["Hausratversicherung", "R+V Allgemeine Versicherung AG"],
        auszug: {
          status: "ausgelesen",
          sparte: "hausrat",
          quelle: "unterlage",
          felder: ok({ versicherer: "R+V", tarifname: "Hausrat Comfort", versicherungsnummer: vNr("7781"), beitrag: 132, zahlweise: "jaehrlich", beginn: "2020-12-01", ablauf: "2026-12-01", kuendigungsfrist_monate: 1, versicherungssumme: 65000, wohnflaeche: 95, unterversicherungsverzicht: false, elementar: true }),
        },
      },
      // Mehrseitiges Foto ohne klaren Spartenbegriff: Sparte vorab unklar, nicht ausgelesen
      { id: "pgp-doc-4b", fileName: "Scan_20261117.pdf", sparte: null, zeilen: ["Nachtrag zum Versicherungsschein", "Ihre Vertragsänderung zum 01.12.2026"], auszug: { status: "sparte_offen", sparte: null } },
      // BU: nicht freigegeben (kein Nachweis „keine Speicherung“), nicht ausgelesen
      { id: "pgp-doc-4c", fileName: "BU Police.pdf", sparte: "bu", gesundheit: true, zeilen: ["Berufsunfähigkeitsversicherung", "Versicherungsschein"], auszug: { status: "gesperrt", sparte: "bu", quelle: "unterlage" } },
    ],
  },
  {
    n: 5,
    name: "Sabine Krüger",
    phone: "4915200000105",
    email: "sabine.krueger@example.com",
    source: "Privathaftpflicht",
    inStunden: 74,
    mode: "phone",
    bitte: true,
    nachweis: [{ art: "einwilligung", ki: true, version: "2026-11-18.s2" }],
    docs: [
      {
        id: "pgp-doc-5a",
        fileName: "Haftpflicht Krueger.pdf",
        sparte: "haftpflicht",
        zeilen: ["Privathaftpflicht", "Gothaer Allgemeine Versicherung AG"],
        auszug: {
          status: "ausgelesen",
          sparte: "haftpflicht",
          quelle: "unterlage",
          geprueft: true,
          felder: ok({ versicherer: "Gothaer", tarifname: "Haftpflicht Plus", versicherungsnummer: vNr("6604"), beitrag: 79, zahlweise: "jaehrlich", beginn: "2018-05-01", ablauf: "2027-05-01", kuendigungsfrist_monate: 3, deckungssumme: 10000000, umfang: "paar", schluesselverlust: true, forderungsausfall: true }),
        },
      },
      {
        id: "pgp-doc-5b",
        fileName: "Hausrat Krueger.pdf",
        sparte: "hausrat",
        zeilen: ["Hausratversicherung", "Gothaer Allgemeine Versicherung AG"],
        auszug: {
          status: "ausgelesen",
          sparte: "hausrat",
          quelle: "unterlage",
          geprueft: true,
          felder: ok({ versicherer: "Gothaer", tarifname: "Hausrat Plus", versicherungsnummer: vNr("6605"), beitrag: 9.4, zahlweise: "monatlich", beginn: "2018-05-01", ablauf: "2027-05-01", kuendigungsfrist_monate: 3, versicherungssumme: 45000, wohnflaeche: 62, unterversicherungsverzicht: true, elementar: true }),
        },
      },
    ],
  },
  { n: 6, name: "Peter Hoffmann", phone: "4915200000106", email: "peter.hoffmann@example.com", source: "Privatschutz", inStunden: 98, mode: "video", bitte: false, nachweis: null, docs: [] },
];

async function main() {
  await prisma.customer.upsert({
    where: { id: C },
    create: { id: C, name: "Agentur Policen Test", leadAddress: "sie", bestandSichtbar: true },
    update: { name: "Agentur Policen Test", leadAddress: "sie", bestandSichtbar: true },
  });
  const passwordHash = await hashPassword(PASSWORT);
  await prisma.user.upsert({
    where: { id: U },
    create: { id: U, email: EMAIL, displayName: "Jonas Berger", passwordHash, role: "BUYER", customerId: C, teamRole: "owner", receivesLeads: true },
    update: { email: EMAIL, displayName: "Jonas Berger", passwordHash, role: "BUYER", customerId: C, teamRole: "owner" },
  });
  // Erstinformation (Datenschutzhinweise für Policen: /datenschutz/policen?k=pgp-erstinfo-token)
  const erst = { name: "Jonas Berger", anrede: "Herr", firma: "Agentur Policen Test", anschrift: "Musterstraße 1, 12345 Musterstadt", telefon: "+49 30 1234567", email: EMAIL };
  await prisma.erstinformation.upsert({ where: { customerId: C }, create: { customerId: C, token: "pgp-erstinfo-token", ...erst }, update: erst });

  for (const l of LEADS) {
    const leadId = `pgp-lead-${l.n}`;
    const convId = `pgp-conv-${l.n}`;
    const startsAt = termin(l.inStunden);
    const lead = { customerId: C, name: l.name, phone: l.phone, email: l.email, source: l.source, status: "Termin", reached: true, assignedUserId: U, firstContactAt: new Date(now.getTime() - 2 * D) };
    await prisma.lead.upsert({ where: { id: leadId }, create: { id: leadId, ...lead, createdAt: new Date(now.getTime() - 3 * D) }, update: lead });
    const t = { customerId: C, leadId, conversationId: convId, mode: l.mode, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), status: "booked", bookedVia: "bot" };
    const conv = { customerId: C, leadId, contactPhone: l.phone, contactName: l.name, botActive: true, qualified: true, lastMessageAt: new Date(now.getTime() - D) };
    await prisma.conversation.upsert({ where: { id: convId }, create: { id: convId, ...conv }, update: conv });
    await prisma.appointment.upsert({ where: { id: `pgp-termin-${l.n}` }, create: { id: `pgp-termin-${l.n}`, ...t }, update: t });

    const msgs: { id: string; direction: string; kind: string; body: string; sentBy: string | null; at: number }[] = [
      { id: `pgp-msg-${l.n}-0`, direction: "outbound", kind: "text", body: `Hallo ${l.name.split(" ")[0]}, Ihr Termin steht. Ich freue mich auf das Gespräch!`, sentBy: "bot", at: 2 * D },
    ];
    if (l.bitte) {
      msgs.push(
        { id: `pgp-msg-${l.n}-1`, direction: "outbound", kind: "text", body: "Damit Herr Berger Ihren Termin gut vorbereiten kann: Schicken Sie bitte vorab Fotos oder PDFs Ihrer aktuellen Policen hier in den Chat, egal ob Haftpflicht, Hausrat oder Kfz. Dann sieht er vorher, wo Sie doppelt zahlen oder Lücken haben, und der Termin geht deutlich schneller.", sentBy: "bot", at: 2 * D - 60_000 },
        { id: `pgp-msg-${l.n}-2`, direction: "internal", kind: "policen_bitte", body: JSON.stringify({ police: null }), sentBy: "bot", at: 2 * D - 50_000 },
      );
      if (l.nachweis) msgs.push({ id: `pgp-msg-${l.n}-3`, direction: "inbound", kind: "text", body: l.nachweis[0].ki ? "Einverstanden" : "Einverstanden, aber ohne KI", sentBy: null, at: D + 2 * H });
      if (l.docs.length) msgs.push({ id: `pgp-msg-${l.n}-4`, direction: "inbound", kind: "document", body: `${l.docs.length} Unterlagen`, sentBy: null, at: D + H });
    }
    for (const m of msgs) {
      const data = { conversationId: convId, direction: m.direction, kind: m.kind, body: m.body, sentBy: m.sentBy, status: m.direction === "outbound" ? "read" : null, createdAt: new Date(now.getTime() - m.at) };
      await prisma.message.upsert({ where: { id: m.id }, create: { id: m.id, ...data }, update: data });
    }

    // Nachweise: nur anhängen (Trigger verbietet UPDATE/DELETE), feste IDs
    let consentId: string | null = null;
    for (const [i, nw] of (l.nachweis ?? []).entries()) {
      const id = `pgp-nachweis-${l.n}-${i}`;
      consentId ??= id;
      const at = new Date(now.getTime() - D - 2 * H + i * 60_000);
      await prisma.$executeRaw`INSERT INTO "PolicenNachweis" ("id","customerId","leadId","phone","art","ki","textVersion","quelle","vermittlerUserId","vermittlerName","createdAt")
        VALUES (${id}, ${C}, ${leadId}, ${l.phone}, ${nw.art}, ${nw.ki}, ${nw.version}, 'whatsapp', ${U}, 'Jonas Berger', ${at}) ON CONFLICT ("id") DO NOTHING`;
    }

    for (const d of l.docs) {
      const roh = await pdf(d.zeilen);
      const doc = {
        customerId: C,
        leadId,
        conversationId: convId,
        status: "gespeichert",
        mimeType: d.mime ?? "application/pdf",
        fileName: d.fileName,
        size: roh.length,
        data: new Uint8Array(encryptBytes(roh)),
        virenStatus: "sauber",
        kind: "police",
        sparte: d.sparte,
        gesundheitsbezug: !!d.gesundheit,
        consentId,
        consentAt: new Date(now.getTime() - D - 2 * H),
        deleteAfter: new Date(startsAt.getTime() + 30 * D),
      };
      await prisma.leadDocument.upsert({ where: { id: d.id }, create: { id: d.id, ...doc, createdAt: new Date(now.getTime() - D - H) }, update: doc });
      if (d.auszug) {
        const a = d.auszug;
        const gelesen = a.status === "ausgelesen";
        const data = {
          customerId: C,
          leadId,
          status: a.status,
          sparte: a.sparte,
          sparteQuelle: a.quelle ?? null,
          felder: a.felder ?? undefined,
          anbieter: gelesen ? "openai-eu" : null,
          modell: gelesen ? "gpt-6.1-terra" : null,
          ausgelesenAt: gelesen ? new Date(now.getTime() - D) : null,
          versuche: gelesen ? 1 : 0,
          geprueftAt: a.geprueft ? new Date(now.getTime() - 3 * H) : null,
          geprueftVonId: a.geprueft ? U : null,
          // Nur die Haftpflicht von Lead 5 bleibt übernommen (Klicks aus der UX-Prüfung zurücksetzen)
          ...(d.id === "pgp-doc-5a" ? {} : { uebernommenAt: null, uebernommenVonId: null, existingContractId: null }),
        };
        await prisma.policenAuszug.upsert({ where: { documentId: d.id }, create: { id: `pgp-auszug-${d.id.slice(8)}`, documentId: d.id, ...data }, update: data });
      }
    }
  }

  // Lead 5: Haftpflicht ausdrücklich in den Bestand übernehmen (echter Ablauf, idempotent)
  const { uebernimmInBestand } = await import("@/lib/policen/auslesen/server");
  const r = await uebernimmInBestand({ customerId: C, userId: U, leadId: "pgp-lead-5" }, "pgp-auszug-5a");
  // Weitere Verträge, die beim Durchklicken übernommen wurden, wieder entfernen
  if (r) await prisma.existingContract.deleteMany({ where: { existingCustomer: { leadId: "pgp-lead-5" }, NOT: { id: r.existingContractId } } });
  console.log(JSON.stringify({ ok: true, kunde: C, login: EMAIL, leads: LEADS.length, bestand: r?.existingContractId ?? null, termine: LEADS.map((l) => `/buyer/termine/pgp-termin-${l.n}/vorbereitung`) }, null, 1));
}

main()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
