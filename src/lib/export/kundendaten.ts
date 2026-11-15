// Datenexport für den Vermittler (Anwalts-Memo, 15.11.2026: Export und Löschung bei Vertragsende, Herausgabe der
// Kundendaten). Ein ZIP mit CSV-Dateien: Leads, Abschlüsse, Termine, Chats, Bestandskunden, Bestandsverträge und
// das Einwilligungsprotokoll. Gelöschte (anonymisierte) Leads fehlen. Download unter Konto & Rechnungen.

import { prisma } from "@/lib/prisma";
import { toCsv, type CsvValue } from "@/lib/export/csv";
import { buildZip } from "@/lib/export/zip";

const MAX_ROWS = 100_000;

const dateTime = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" }).format(d) : "";
const num = (v: unknown) => (v == null ? "" : String(v).replace(".", ","));
const phone = (p: string | null | undefined) => (p ? `+${p}` : "");
const answers = (f: unknown) => (Array.isArray(f) ? (f as { label?: string; value?: string }[]).map((a) => `${a.label ?? ""}: ${a.value ?? ""}`).join(" | ") : "");

export type ExportCounts = { leads: number; contracts: number; appointments: number; messages: number; bestand: number; bestandContracts: number; consentLogs: number };

export async function buildCustomerExport(customerId: string, now = new Date()): Promise<{ fileName: string; zip: Buffer; counts: ExportCounts }> {
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId }, select: { name: true } });
  const [leads, contracts, appointments, bestand, bestandContracts, consentLogs] = await Promise.all([
    prisma.lead.findMany({
      where: { customerId, erasedAt: null },
      orderBy: { createdAt: "asc" },
      take: MAX_ROWS,
      select: { id: true, createdAt: true, name: true, phone: true, email: true, source: true, adChannel: true, status: true, closedAt: true, closeValue: true, notes: true, formData: true, followUpAt: true, followUpNote: true },
    }),
    prisma.leadContract.findMany({
      where: { customerId, lead: { erasedAt: null } },
      orderBy: { signedAt: "asc" },
      take: MAX_ROWS,
      select: { leadId: true, sparte: true, productName: true, premium: true, signedAt: true, insurer: true, contractNo: true, lead: { select: { name: true } } },
    }),
    prisma.appointment.findMany({
      where: { customerId, OR: [{ leadId: null }, { lead: { erasedAt: null } }] },
      orderBy: { startsAt: "asc" },
      take: MAX_ROWS,
      select: { leadId: true, startsAt: true, mode: true, status: true, lead: { select: { name: true } } },
    }),
    prisma.existingCustomer.findMany({ where: { customerId }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], take: MAX_ROWS }),
    prisma.existingContract.findMany({
      where: { existingCustomer: { customerId } },
      take: MAX_ROWS,
      select: { existingCustomerId: true, line: true, product: true, contractNo: true, insurer: true, status: true, annualPremium: true, startDate: true, renewalDate: true, existingCustomer: { select: { externalNo: true } } },
    }),
    prisma.bestandConsentLog.findMany({ where: { customerId }, orderBy: { createdAt: "asc" }, take: MAX_ROWS, include: { existingCustomer: { select: { externalNo: true, email: true, phone: true } } } }),
  ]);
  const convs = await prisma.conversation.findMany({ where: { customerId, OR: [{ leadId: null }, { lead: { erasedAt: null } }] }, select: { id: true, leadId: true, contactPhone: true, contactName: true } });
  const convById = new Map(convs.map((c) => [c.id, c]));
  const messages = convs.length
    ? await prisma.message.findMany({ where: { conversationId: { in: convs.map((c) => c.id) } }, orderBy: { createdAt: "asc" }, take: MAX_ROWS * 2, select: { conversationId: true, direction: true, kind: true, body: true, sentBy: true, createdAt: true } })
    : [];

  const files: { name: string; header: string[]; rows: CsvValue[][] }[] = [
    {
      name: "leads.csv",
      header: ["Lead-ID", "Eingang", "Name", "Telefon", "E-Mail", "Produkt", "Kanal", "Status", "Abschluss am", "Abschlusswert", "Notizen", "Wiedervorlage", "Wiedervorlage Notiz", "Formularangaben"],
      rows: leads.map((l) => [l.id, dateTime(l.createdAt), l.name, phone(l.phone), l.email, l.source, l.adChannel, l.status, dateTime(l.closedAt), num(l.closeValue), l.notes, dateTime(l.followUpAt), l.followUpNote, answers(l.formData)]),
    },
    {
      name: "abschluesse.csv",
      header: ["Lead-ID", "Name", "Sparte", "Produkt", "Beitrag", "Unterschrieben am", "Versicherer", "Vertragsnummer"],
      rows: contracts.map((c) => [c.leadId, c.lead.name, c.sparte, c.productName, num(c.premium), dateTime(c.signedAt), c.insurer, c.contractNo]),
    },
    {
      name: "termine.csv",
      header: ["Lead-ID", "Name", "Beginn", "Art", "Status"],
      rows: appointments.map((a) => [a.leadId, a.lead?.name, dateTime(a.startsAt), a.mode, a.status]),
    },
    {
      name: "chats.csv",
      header: ["Lead-ID", "Kontakt", "Telefon", "Zeitpunkt", "Richtung", "Von", "Art", "Text"],
      rows: messages.map((m) => {
        const c = convById.get(m.conversationId);
        return [c?.leadId, c?.contactName, phone(c?.contactPhone), dateTime(m.createdAt), m.direction === "inbound" ? "eingehend" : "ausgehend", m.sentBy, m.kind, m.body];
      }),
    },
    {
      name: "bestand_kunden.csv",
      header: [
        "Bestands-ID", "Kundennummer", "Anrede", "Vorname", "Nachname", "Firma", "Telefon", "E-Mail", "Geburtsdatum", "Straße", "PLZ", "Ort", "Sparten", "Jahresbeitrag gesamt",
        "Einwilligung E-Mail", "Einwilligung E-Mail am", "Einwilligung WhatsApp", "Einwilligung WhatsApp am", "Hinweis Widerspruchsrecht", "Hinweis am", "Hinweis Wortlaut/Quelle",
        "Abgemeldet (alle Kanäle)", "Abgemeldet (E-Mail)", "Zuletzt angeschrieben",
      ],
      rows: bestand.map((e) => [
        e.id, e.externalNo, e.salutation, e.firstName, e.lastName, e.company, phone(e.phone), e.email, e.birthday, e.street, e.zip, e.city, e.lines.join(", "), num(e.premiumTotal),
        e.emailConsent, dateTime(e.emailConsentAt), e.whatsappConsent, dateTime(e.whatsappConsentAt), e.widerspruchHinweis, dateTime(e.widerspruchHinweisAt), e.widerspruchHinweisText,
        dateTime(e.optOutAt), dateTime(e.emailOptOutAt), dateTime(e.lastCampaignAt),
      ]),
    },
    {
      name: "bestand_vertraege.csv",
      header: ["Bestands-ID", "Kundennummer", "Sparte", "Produkt", "Vertragsnummer", "Versicherer", "Status", "Jahresbeitrag", "Beginn", "Ablauf"],
      rows: bestandContracts.map((c) => [c.existingCustomerId, c.existingCustomer.externalNo, c.line, c.product, c.contractNo, c.insurer, c.status, num(c.annualPremium), c.startDate, c.renewalDate]),
    },
    {
      name: "einwilligungsprotokoll.csv",
      header: ["Zeitpunkt", "Bestands-ID", "Kundennummer", "Kanal", "Vorgang", "Quelle", "Adresse", "Text", "IP", "bestätigt am"],
      rows: consentLogs.map((l) => [dateTime(l.createdAt), l.existingCustomerId, l.existingCustomer?.externalNo, l.channel, l.action, l.source, l.address, l.text, l.ip, dateTime(l.confirmedAt)]),
    },
  ];
  const counts: ExportCounts = {
    leads: leads.length,
    contracts: contracts.length,
    appointments: appointments.length,
    messages: messages.length,
    bestand: bestand.length,
    bestandContracts: bestandContracts.length,
    consentLogs: consentLogs.length,
  };
  const stamp = now.toISOString().slice(0, 10);
  const readme = [
    `Datenexport ${customer.name}, erstellt am ${dateTime(now)} Uhr`,
    "",
    "Alle Dateien sind CSV (Semikolon, UTF-8) und lassen sich direkt mit Excel öffnen.",
    "",
    ...files.map((f) => `${f.name}: ${f.rows.length} Zeilen`),
    "",
    "Gelöschte Leads (Datenschutz) sind nicht enthalten. Abmeldungen der Sperrliste liegen nur verschlüsselt vor und sind",
    "deshalb nicht im Export; die Spalten „Abgemeldet“ in bestand_kunden.csv zeigen sie je Kunde.",
  ].join("\r\n");
  const zip = buildZip([{ name: "LIESMICH.txt", data: readme }, ...files.map((f) => ({ name: f.name, data: toCsv(f.header, f.rows) }))], now);
  const slug = customer.name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "export";
  return { fileName: `performancegrowth-export-${slug}-${stamp}.zip`, zip, counts };
}
