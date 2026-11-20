// Testdaten für das Zusatzmodul „Empfehlungen & Bewertungen“ (nur lokale Datenbank).
// Start: npx vite-node --config vitest.config.ts tools/empfehlung/testdaten.ts
//
// Legt an (feste ids mit Präfix „emp_“, beliebig oft ausführbar, überschreibt nur die eigenen Datensätze):
// - Vermittler „Testagentur Empfehlung“ (empfehlung@test.local / Test1234!test): Modul aktiv in der Testphase,
//   Google-Bewertungslink hinterlegt, WhatsApp „verbunden“ (ohne Schlüssel, es geht nichts raus), Vorlagen freigegeben.
//   40 Abschlüsse in allen Stufen: Nachfrage geplant, ohne Einwilligung, gesendet, Lob (mit Empfehlungslink), Kritik mit
//   offener Aufgabe, Kritik geklärt, Rückfrage, Bitte um Empfehlung an Tag 21, Empfehlung eingegangen, Abschluss mit Dank,
//   „Nicht anfragen“, STOPP. Dazu 8 empfohlene Personen als Leads (neu, Termin, Abschluss), Besucher, allgemeiner Link.
//   Dazu 8 ältere Abschlüsse (emp_lead_41 bis 48) für die Liste „Heute fragen“ (Paket 2).
// - Leerer Zustand „Testagentur Empfehlung leer“ (empfehlung-leer@test.local): Modul aktiv, ohne Google-Link, keine Daten.
// Alle Telefonnummern sind erfunden (49155 5…), es wird nichts verschickt.

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { FEEDBACK_CONSENT_TEXT, UNHAPPY_TASK } from "@/lib/empfehlung/shared";

const PASSWORT = "Test1234!test";
const DAY = 86_400_000;

function nurLokal() {
  const url = process.env.DATABASE_URL ?? "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = "";
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    console.error("Abbruch: DATABASE_URL zeigt nicht auf localhost.");
    process.exit(1);
  }
}

const ID = { main: "emp_cust_main", leer: "emp_cust_leer", wa: "emp_wa_main", general: "emp_link_general" };

const NAMEN = [
  "Thomas Müller", "Sabine Schmidt", "Michael Schneider", "Petra Fischer", "Andreas Weber", "Claudia Meyer", "Stefan Wagner", "Andrea Becker",
  "Jürgen Schulz", "Monika Hoffmann", "Frank Schäfer", "Julia Koch", "Markus Bauer", "Anna Richter", "Peter Klein", "Katrin Wolf",
  "Christian Schröder", "Susanne Neumann", "Klaus Schwarz", "Birgit Zimmermann", "Uwe Braun", "Lena Krüger", "Ralf Hofmann", "Sarah Hartmann",
  "Jan Lange", "Nicole Schmitt", "Tobias Werner", "Heike Krause", "Lukas Meier", "Laura Lehmann", "Dieter Schmid", "Karin Schulze",
  "Holger Maier", "Silke Köhler", "Bernd Herrmann", "Ute König", "Rainer Walter", "Tanja Mayer", "Volker Huber", "Ines Kaiser",
];
const EMPFOHLENE = ["Martin Vogel", "Eva Brandt", "Oliver Sommer", "Melanie Roth", "Sven Busch", "Jana Kuhn", "Patrick Engel", "Carina Pohl"];
const PRODUKTE: [string, string, number][] = [
  ["Privatschutz", "privatschutz", 180], ["Tierversicherung Hund", "hund", 420], ["Zahnzusatz", "sonstiges", 300], ["Kfz", "kfz", 650],
  ["Hausrat", "hausrat", 140], ["Rechtsschutz", "rechtsschutz", 290], ["Unfall", "unfall", 210], ["Tierversicherung Katze", "katze", 260],
];

type Stufe =
  | "geplant" | "ohne_einwilligung" | "gesendet" | "lob" | "kritik_offen" | "kritik_geklaert" | "rueckfrage"
  | "bitte_tag21" | "empfehlung_da" | "empfehlung_abschluss" | "aus" | "stopp";

// 40 Abschlüsse, Reihenfolge = Nummer 1..40
const STUFEN: Stufe[] = [
  ...Array<Stufe>(5).fill("geplant"),
  ...Array<Stufe>(2).fill("ohne_einwilligung"),
  ...Array<Stufe>(6).fill("gesendet"),
  ...Array<Stufe>(8).fill("lob"),
  ...Array<Stufe>(2).fill("kritik_offen"),
  "kritik_geklaert",
  ...Array<Stufe>(2).fill("rueckfrage"),
  ...Array<Stufe>(6).fill("bitte_tag21"),
  ...Array<Stufe>(4).fill("empfehlung_da"),
  ...Array<Stufe>(2).fill("empfehlung_abschluss"),
  "aus",
  "stopp",
];

const LOB = [
  "Alles super, vielen Dank für die schnelle Hilfe!",
  "Top Beratung, sehr verständlich erklärt.",
  "Hat alles gepasst, danke!",
  "Sehr zufrieden, gerne wieder.",
  "Danke, die Police ist schon da. Klasse!",
];
const KRITIK = ["Ich warte seit zwei Wochen auf die Police, das ärgert mich.", "Der Beitrag ist höher als besprochen, bitte melden Sie sich."];

async function kunde(id: string, name: string, data: Record<string, unknown>) {
  const other = await prisma.customer.findUnique({ where: { name }, select: { id: true } });
  if (other && other.id !== id) throw new Error(`Kunde „${name}“ existiert schon mit anderer id`);
  await prisma.customer.upsert({ where: { id }, update: { name, ...data }, create: { id, name, ...data } });
}

async function login(email: string, customerId: string, displayName: string) {
  const passwordHash = await hashPassword(PASSWORT);
  await prisma.user.upsert({
    where: { email },
    update: { customerId, displayName, teamRole: "owner", passwordHash, role: "BUYER" },
    create: { id: `emp_user_${email.split("@")[0]}`, email, passwordHash, role: "BUYER", customerId, displayName, teamRole: "owner" },
  });
}

async function main() {
  nurLokal();
  const now = new Date();
  const ago = (d: number) => new Date(now.getTime() - d * DAY);
  const ahead = (d: number) => new Date(now.getTime() + d * DAY);
  const n2 = (i: number) => String(i).padStart(2, "0");

  // ── Vermittler ──
  const basis = { plan: "software", vermittlerTyp: "vertreter", isTest: false, newUi: true };
  const modul = { empfehlungEnabled: true, empfehlungSince: ago(60), empfehlungTrialEndsAt: ahead(12), empfehlungMonthly: null, empfehlungCancelAt: null };
  await kunde(ID.main, "Testagentur Empfehlung", { ...basis, ...modul });
  await kunde(ID.leer, "Testagentur Empfehlung leer", { ...basis, ...modul, empfehlungSince: ago(1), empfehlungTrialEndsAt: ahead(29) });
  await login("empfehlung@test.local", ID.main, "Markus Empfehl");
  await login("empfehlung-leer@test.local", ID.leer, "Lena Leer");

  await prisma.whatsAppAccount.upsert({
    where: { customerId: ID.main },
    update: { status: "connected", phoneNumber: "4915550009999" },
    create: { id: ID.wa, customerId: ID.main, status: "connected", displayName: "Testagentur Empfehlung", phoneNumber: "4915550009999" },
  });
  for (const purpose of ["review_request", "referral_request", "referral_thanks", "referral_update"]) {
    const id = `emp_tpl_${purpose}`;
    await prisma.messageTemplate.upsert({
      where: { id },
      update: { status: "approved" },
      create: { id, customerId: ID.main, name: `pg_${purpose}`, purpose, status: "approved", language: "de", category: "marketing", body: "Testvorlage" },
    });
  }

  await prisma.reviewSettings.upsert({
    where: { customerId: ID.main },
    update: { active: true, googleReviewUrl: "https://g.page/r/testagentur-empfehlung/review", offerKind: "ordner", referralOnPraise: true },
    create: { id: "emp_rs_main", customerId: ID.main, googleReviewUrl: "https://g.page/r/testagentur-empfehlung/review", offerKind: "ordner" },
  });
  await prisma.reviewSettings.upsert({ where: { customerId: ID.leer }, update: { googleReviewUrl: null }, create: { id: "emp_rs_leer", customerId: ID.leer } });

  // ── Aufräumen der eigenen Bewegungsdaten ──
  for (const cid of [ID.main, ID.leer]) {
    await prisma.referralVisit.deleteMany({ where: { customerId: cid } });
    await prisma.reviewRequest.deleteMany({ where: { customerId: cid } });
    await prisma.appointment.deleteMany({ where: { customerId: cid } });
    await prisma.leadContract.deleteMany({ where: { customerId: cid } });
    await prisma.lead.deleteMany({ where: { customerId: cid } });
    await prisma.referralLink.deleteMany({ where: { customerId: cid } });
  }

  await prisma.referralLink.create({ data: { id: ID.general, customerId: ID.main, token: "empgeneral0000000000000001", kind: "general", views: 14, createdAt: ago(40) } });

  // ── 40 Abschlüsse ──
  let empfIdx = 0;
  for (let i = 1; i <= 40; i++) {
    const stufe = STUFEN[i - 1];
    const leadId = `emp_lead_${n2(i)}`;
    const [produkt, sparte, beitrag] = PRODUKTE[i % PRODUKTE.length];
    // Abschlusszeitpunkt passend zur Stufe
    const closedDays =
      stufe === "geplant" ? 3 + i : stufe === "ohne_einwilligung" ? 2 + i - 5 : ["gesendet", "lob", "kritik_offen", "kritik_geklaert", "rueckfrage"].includes(stufe) ? 15 + (i % 5) : stufe === "bitte_tag21" ? 22 + (i % 6) : 30 + (i % 20);
    const closedAt = ago(closedDays);
    const reviewDueAt = new Date(closedAt.getTime() + 14 * DAY);
    const referralDueAt = new Date(closedAt.getTime() + 21 * DAY);
    const consent = stufe !== "ohne_einwilligung";
    const offenKritik = stufe === "kritik_offen";
    await prisma.lead.create({
      data: {
        id: leadId,
        customerId: ID.main,
        source: produkt,
        name: NAMEN[i - 1],
        phone: `4915551${String(10000 + i)}`,
        email: `kunde${n2(i)}@example.com`,
        status: "Abschluss",
        closedAt,
        closeValue: beitrag,
        createdAt: new Date(closedAt.getTime() - 10 * DAY),
        feedbackConsentAt: consent ? new Date(closedAt.getTime() + 600_000) : null,
        feedbackConsentSource: consent ? "vermittler" : null,
        feedbackConsentText: consent ? FEEDBACK_CONSENT_TEXT : null,
        feedbackOptOutAt: stufe === "stopp" ? ago(5) : null,
        followUpAt: offenKritik ? ago(1) : null,
        followUpNote: offenKritik ? `${UNHAPPY_TASK}: „${KRITIK[i % 2]}“` : null,
      },
    });
    await prisma.leadContract.create({ data: { id: `${leadId}_v`, leadId, customerId: ID.main, primaryLeadId: leadId, sparte, premium: beitrag, signedAt: closedAt, insurer: "Allianz", premiumSource: "vermittler" } });

    if (stufe === "ohne_einwilligung") continue; // noch keine Nachfrage angelegt (wartet auf Einwilligung)

    const sentAt = stufe === "geplant" ? null : stufe === "stopp" ? ago(6) : reviewDueAt;
    const answered = ["lob", "kritik_offen", "kritik_geklaert", "rueckfrage", "bitte_tag21", "empfehlung_da", "empfehlung_abschluss"].includes(stufe) && i % 3 !== 0
      ? true
      : ["lob", "kritik_offen", "kritik_geklaert", "rueckfrage"].includes(stufe);
    const sentiment = !answered ? null : stufe.startsWith("kritik") ? "negative" : stufe === "rueckfrage" ? "neutral" : "positive";
    const comment = sentiment === "positive" ? LOB[i % LOB.length] : sentiment === "negative" ? KRITIK[i % 2] : sentiment === "neutral" ? "Kann ich die Police auch per Mail bekommen?" : null;
    const lobLink = stufe === "lob"; // Lob mit Empfehlungslink direkt im Dank
    const tag21 = ["bitte_tag21", "empfehlung_da", "empfehlung_abschluss"].includes(stufe);
    const referralSentAt = lobLink ? new Date(reviewDueAt.getTime() + 3 * 3_600_000) : tag21 ? referralDueAt : null;
    const status = stufe === "geplant" ? "scheduled" : stufe === "aus" ? "off" : stufe === "stopp" ? "skipped" : answered ? "answered" : "sent";
    const referralStatus = referralSentAt ? "sent" : stufe.startsWith("kritik") || stufe === "aus" || stufe === "stopp" ? "skipped" : "waiting";

    await prisma.reviewRequest.create({
      data: {
        id: `emp_rr_${n2(i)}`,
        customerId: ID.main,
        leadId,
        token: `emprr${n2(i)}00000000000000000`,
        status,
        reviewDueAt: stufe === "aus" ? reviewDueAt : reviewDueAt,
        reviewSentAt: status === "off" ? null : sentAt,
        sendMode: sentAt ? "template" : null,
        sentiment,
        comment,
        answeredAt: answered && sentAt ? new Date(sentAt.getTime() + 2 * 3_600_000) : null,
        resolvedAt: stufe === "kritik_geklaert" ? ago(2) : null,
        googleClicks: sentiment === "positive" && i % 2 === 0 ? 1 : stufe === "gesendet" && i % 3 === 0 ? 1 : 0,
        googleClickAt: sentiment === "positive" && i % 2 === 0 && sentAt ? new Date(sentAt.getTime() + 3 * 3_600_000) : null,
        referralStatus,
        referralDueAt: stufe === "stopp" || stufe.startsWith("kritik") ? null : referralDueAt,
        referralSentAt,
        referralViews: referralSentAt ? (i % 4) + (tag21 ? 1 : 0) : 0,
        note: stufe === "stopp" ? "Kunde hat mit STOPP widersprochen" : null,
        updatedAt: answered && sentAt ? new Date(sentAt.getTime() + 2 * 3_600_000) : sentAt ?? closedAt,
      },
    });

    if (!referralSentAt) continue;
    // Persönlicher Empfehlungslink des Kunden
    const linkId = `emp_link_${n2(i)}`;
    const views = stufe === "empfehlung_da" || stufe === "empfehlung_abschluss" ? 3 + (i % 3) : i % 3;
    await prisma.referralLink.create({
      data: { id: linkId, customerId: ID.main, leadId, token: `emplink${n2(i)}000000000000000`, views, lastSentAt: referralSentAt, lastOccasion: null, createdAt: referralSentAt },
    });
    for (let v = 0; v < Math.min(views, 3); v++) {
      await prisma.referralVisit.create({ data: { id: `${linkId}_b${v}`, linkId, customerId: ID.main, visitorHash: `emp${n2(i)}visitor${v}`, createdAt: new Date(referralSentAt.getTime() + (v + 1) * 3_600_000) } });
    }

    // Empfohlene Personen
    const anzahl = stufe === "empfehlung_abschluss" ? 1 : stufe === "empfehlung_da" ? (i % 2 === 0 ? 2 : 1) : 0;
    for (let k = 0; k < anzahl && empfIdx < EMPFOHLENE.length; k++) {
      const refId = `emp_ref_${n2(empfIdx + 1)}`;
      const name = EMPFOHLENE[empfIdx];
      const created = new Date(referralSentAt.getTime() + (2 + k) * DAY);
      const abschluss = stufe === "empfehlung_abschluss";
      const termin = !abschluss && empfIdx % 2 === 1;
      await prisma.lead.create({
        data: {
          id: refId,
          customerId: ID.main,
          source: "Empfehlung",
          adChannel: "Empfehlung",
          name,
          phone: `4915552${String(10000 + empfIdx)}`,
          email: `empfohlen${n2(empfIdx + 1)}@example.com`,
          status: abschluss ? "Abschluss" : termin ? "Termin vereinbart" : "Neuer Lead",
          createdAt: created,
          closedAt: abschluss ? new Date(created.getTime() + 6 * DAY) : null,
          closeValue: abschluss ? 320 : null,
          referralLinkId: linkId,
          referralStatusConsent: empfIdx % 2 === 0,
          referralNotifiedStage: termin ? "termin" : empfIdx % 2 === 0 ? "gemeldet" : null,
          referralThankedAt: abschluss ? new Date(created.getTime() + 6 * DAY + 3_600_000) : null,
          formData: [
            { label: "Quelle", value: `Empfehlung von ${NAMEN[i - 1]}` },
            { label: "Angebot", value: "Kostenloser Versicherungsordner-Check" },
            { label: "Thema", value: produkt },
            { label: "Einwilligung", value: "Kontaktaufnahme per Telefon, WhatsApp und E-Mail erlaubt (Empfehlungsseite)" },
          ],
        },
      });
      if (termin || abschluss) {
        const startsAt = new Date(created.getTime() + 3 * DAY);
        await prisma.appointment.create({
          data: { id: `${refId}_t`, customerId: ID.main, leadId: refId, mode: "phone", startsAt, endsAt: new Date(startsAt.getTime() + 1_800_000), status: startsAt < now ? "completed" : "booked", createdAt: created },
        });
      }
      if (abschluss) {
        await prisma.leadContract.create({ data: { id: `${refId}_v`, leadId: refId, customerId: ID.main, primaryLeadId: refId, sparte: "privatschutz", premium: 320, signedAt: new Date(created.getTime() + 6 * DAY), insurer: "Allianz", premiumSource: "vermittler" } });
      }
      empfIdx++;
    }
  }

  // ── Ältere Abschlüsse vor dem Modul (Paket 2, Liste „Heute fragen“) ──
  // 41 bis 44 erscheinen in „Heute fragen“ (44 mit Termin gestern), 45 wurde vor 30 Tagen gefragt, 46 ohne Einwilligung
  // („Zustimmung fehlt“), 47 STOPP, 48 offene Aufgabe „unzufrieden“: diese drei nie in „Heute fragen“.
  const ALT: { n: number; tage: number; produkt: string; sparte: string; consent: boolean; extra?: Record<string, unknown> }[] = [
    { n: 41, tage: 45, produkt: "Kfz", sparte: "kfz", consent: true },
    { n: 42, tage: 90, produkt: "Hausrat", sparte: "hausrat", consent: true },
    { n: 43, tage: 160, produkt: "Rechtsschutz", sparte: "rechtsschutz", consent: true },
    { n: 44, tage: 200, produkt: "Privatschutz", sparte: "privatschutz", consent: true },
    { n: 45, tage: 60, produkt: "Unfall", sparte: "unfall", consent: true },
    { n: 46, tage: 50, produkt: "Kfz", sparte: "kfz", consent: false },
    { n: 47, tage: 70, produkt: "Hausrat", sparte: "hausrat", consent: true, extra: { feedbackOptOutAt: ago(20) } },
    { n: 48, tage: 120, produkt: "Kfz", sparte: "kfz", consent: true, extra: { followUpAt: ago(1), followUpNote: `${UNHAPPY_TASK}: „Rückruf fehlt“` } },
  ];
  const ALT_NAMEN = ["Gerd Brandt", "Simone Arnold", "Wolfgang Franke", "Martina Berger", "Helmut Roth", "Kerstin Fuchs", "Norbert Vogt", "Elke Simon"];
  for (const [k, a] of ALT.entries()) {
    const leadId = `emp_lead_${a.n}`;
    const closedAt = ago(a.tage);
    await prisma.lead.create({
      data: {
        id: leadId,
        customerId: ID.main,
        source: a.produkt,
        name: ALT_NAMEN[k],
        phone: `4915551${String(10000 + a.n)}`,
        status: "Abschluss",
        closedAt,
        closeValue: 300,
        createdAt: new Date(closedAt.getTime() - 10 * DAY),
        feedbackConsentAt: a.consent ? new Date(closedAt.getTime() + 600_000) : null,
        feedbackConsentSource: a.consent ? "vermittler" : null,
        feedbackConsentText: a.consent ? FEEDBACK_CONSENT_TEXT : null,
        ...(a.extra ?? {}),
      },
    });
    await prisma.leadContract.create({ data: { id: `${leadId}_v`, leadId, customerId: ID.main, primaryLeadId: leadId, sparte: a.sparte, premium: 300, signedAt: closedAt, insurer: "Allianz", premiumSource: "vermittler" } });
    if (a.n === 44) {
      const startsAt = ago(1);
      await prisma.appointment.create({ data: { id: `${leadId}_t`, customerId: ID.main, leadId, mode: "phone", startsAt, endsAt: new Date(startsAt.getTime() + 1_800_000), status: "completed", createdAt: ago(5) } });
    }
    if (a.n === 45) {
      await prisma.referralLink.create({ data: { id: `emp_link_${a.n}`, customerId: ID.main, leadId, token: `emplink${a.n}000000000000000`, lastSentAt: ago(30), createdAt: ago(30) } });
    }
  }

  // Eine Empfehlung über den allgemeinen Link (Signatur)
  await prisma.lead.create({
    data: {
      id: "emp_ref_general",
      customerId: ID.main,
      source: "Empfehlung",
      adChannel: "Empfehlung",
      name: "Robert Lindner",
      phone: "4915552099999",
      status: "Neuer Lead",
      createdAt: ago(4),
      referralLinkId: ID.general,
      formData: [{ label: "Quelle", value: "Empfehlung (allgemeiner Link aus der E-Mail-Signatur)" }],
    },
  });

  const counts = await Promise.all([
    prisma.lead.count({ where: { customerId: ID.main, status: "Abschluss" } }),
    prisma.reviewRequest.count({ where: { customerId: ID.main } }),
    prisma.referralLink.count({ where: { customerId: ID.main } }),
    prisma.lead.count({ where: { customerId: ID.main, referralLinkId: { not: null } } }),
  ]);
  console.log(`Fertig: ${counts[0]} Abschlüsse, ${counts[1]} Nachfragen, ${counts[2]} Empfehlungslinks, ${counts[3]} empfohlene Personen.`);
  console.log("Login: empfehlung@test.local bzw. empfehlung-leer@test.local, Passwort Test1234!test");
  console.log("Öffentliche Seiten: /empfehlung/emplink33000000000000000 (Empfehlender), /empfehlung/emplink33000000000000000/kontakt (empfohlene Person)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
