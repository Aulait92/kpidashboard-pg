// Mahnwesen (Ole, 17.11.2026): Fälle aus Stripe anlegen und schließen, Mahnlauf im WhatsApp-Cron (alle 5 Minuten,
// gesichert wie alle Crons über WHATSAPP_WEBHOOK_SECRET, docs/sicherheit-cron.md), Bankabgleich (Enable Banking),
// Stopp je Kunde und Übersicht der offenen Posten. Regeln und Texte: lib/mahnwesen.ts.
//
// Nicht doppelt mahnen:
// - Setup-Rechnung eines Angebots, dessen Zahlung (noch) nicht eingerichtet ist (z. B. geplatzte Setup-Lastschrift):
//   Dafür läuft die Zahlungserinnerung zum Angebot (lib/angebot-zahlungserinnerung-server.ts) mit Link zu einer
//   neuen Zahlung. Kein Mahnfall.
// - Je Rechnung genau ein Fall (stripeInvoiceId eindeutig), je Stufe höchstens eine Nachricht (Stufe wird vor dem
//   Versand beansprucht).
// - Die alte Warnung „Offene Rechnung“ nach 21 Tagen (lib/pause.ts) entfällt bei aktivem Mahnwesen für Kunden mit
//   offenem Mahnfall.
// - Stripe selbst darf keine Erinnerungen schicken (Dashboard: Rechnungen → Erinnerungen aus), siehe Bericht an Ole.

import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { sendToAdmins } from "@/lib/push";
import { getAppUrl, sendCustomerMail } from "@/lib/email";
import { customerGreeting, logOfferActivity } from "@/lib/offer-links";
import { stripeClient } from "@/lib/billing";
import { erinnerungGestoppt } from "@/lib/angebot-zahlungserinnerung";
import {
  anrufAufgabe,
  artVonRechnung,
  bankAbgleich,
  eurCent,
  fmtDatum,
  jetztAusfuehren,
  mahnStoppGrund,
  mahnText,
  mahnwesenAktiv,
  naechsteStufe,
  rechnungVorlage,
  stufeLabel,
  tagDatum,
  tageUeberfaellig,
  type Stufe,
} from "@/lib/mahnwesen";
import { berlinTodayIso } from "@/lib/offer-pricing";

const idOf = (v: string | { id?: string | null } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));

// ─── Fälle anlegen und schließen ─────────────────────────────────────────

type InvoiceLike = Pick<
  Stripe.Invoice,
  "id" | "number" | "status" | "collection_method" | "due_date" | "amount_remaining" | "currency" | "hosted_invoice_url" | "invoice_pdf" | "metadata" | "customer_email"
> & { customer: string | { id: string } | null | Stripe.Customer | Stripe.DeletedCustomer };

/** Setup-Rechnung eines Angebots, für das noch die Zahlungserinnerung zum Angebot läuft? (dann kein Mahnfall) */
async function angebotsErinnerungLaeuft(inv: InvoiceLike): Promise<boolean> {
  const offerId = inv.metadata?.offer_id;
  if (!offerId) return false;
  const offer = await prisma.offer.findUnique({ where: { id: offerId } });
  if (!offer) return false;
  return erinnerungGestoppt(offer) === null;
}

/**
 * Fall zu einer offenen Rechnung anlegen bzw. auffrischen (Betrag, Links). Überweisung: Fälligkeit = due_date.
 * Fehlgeschlagene Lastschrift/Karte: Fälligkeit = Tag des Fehlschlags. Stufe und Zeitpunkte bleiben erhalten.
 * Nur bei aktivem Mahnwesen. Gibt die ID des Falls zurück oder null.
 */
export async function mahnfallAusRechnung(
  inv: InvoiceLike,
  opts: { fehlgeschlagen?: boolean; pmType?: string | null; now?: Date } = {},
): Promise<string | null> {
  if (!mahnwesenAktiv() || !inv.id) return null;
  const now = opts.now ?? new Date();
  const stripeCustomerId = idOf(inv.customer as string | { id: string } | null);
  if (!stripeCustomerId || inv.status !== "open" || !((inv.amount_remaining ?? 0) > 0)) return null;
  const ueberweisung = inv.collection_method === "send_invoice";
  if (!ueberweisung && !opts.fehlgeschlagen) return null;
  if (await angebotsErinnerungLaeuft(inv)) return null;
  const existing = await prisma.mahnfall.findUnique({ where: { stripeInvoiceId: inv.id } });
  const customer = await prisma.customer.findUnique({ where: { stripeCustomerId }, select: { id: true } });
  const due = ueberweisung && inv.due_date ? new Date(inv.due_date * 1000) : now;
  const data = {
    stripeCustomerId,
    customerId: customer?.id ?? existing?.customerId ?? null,
    offerId: inv.metadata?.offer_id || existing?.offerId || null,
    invoiceNumber: inv.number ?? existing?.invoiceNumber ?? null,
    email: inv.customer_email ?? existing?.email ?? null,
    amountDue: inv.amount_remaining ?? 0,
    currency: inv.currency ?? "eur",
    hostedUrl: inv.hosted_invoice_url ?? existing?.hostedUrl ?? null,
    pdfUrl: inv.invoice_pdf ?? existing?.pdfUrl ?? null,
  };
  if (existing) {
    // Wieder offen (z. B. neue fehlgeschlagene Abbuchung nach Schließen): neu beginnen
    const reopen = existing.status !== "offen";
    await prisma.mahnfall.update({
      where: { id: existing.id },
      data: {
        ...data,
        ...(reopen
          ? { status: "offen", stufe: 0, dueDate: tagDatum(berlinTodayIso(due)), bezahltAt: null, bezahltVia: null, letzteMailAt: null, erinnertAt: null, faelligAt: null, mahnung1At: null, mahnung2At: null, anrufAufgabeAt: null, anrufAufgabeId: null }
          : {}),
      },
    });
    return existing.id;
  }
  const created = await prisma.mahnfall
    .create({
      data: {
        ...data,
        stripeInvoiceId: inv.id,
        art: artVonRechnung(inv.collection_method, opts.pmType ?? null),
        dueDate: tagDatum(berlinTodayIso(due)),
      },
    })
    .catch((err: { code?: string }) => {
      if (err.code === "P2002") return null; // parallel angelegt
      throw err;
    });
  return created?.id ?? null;
}

/** Zahlung eingegangen (Webhook invoice.paid, Bankabgleich, Stripe-Abgleich): Fall schließen, Anruf-Aufgabe erledigen. */
export async function rechnungBezahlt(stripeInvoiceId: string, via: "stripe" | "bank" | "manuell", now = new Date()): Promise<boolean> {
  const f = await prisma.mahnfall.findUnique({ where: { stripeInvoiceId } });
  if (!f || f.status === "bezahlt") return false;
  const done = await prisma.mahnfall.updateMany({ where: { id: f.id, status: { not: "bezahlt" } }, data: { status: "bezahlt", bezahltAt: now, bezahltVia: via } });
  if (done.count !== 1) return false;
  if (f.anrufAufgabeId) await prisma.salesTask.updateMany({ where: { id: f.anrufAufgabeId, doneAt: null }, data: { doneAt: now } }).catch(() => {});
  const contactId = f.customerId ? (await prisma.customer.findUnique({ where: { id: f.customerId }, select: { salesContact: { select: { id: true } } } }))?.salesContact?.id ?? null : null;
  if (contactId && f.stufe > 0) {
    await logOfferActivity({ dealId: null, salesContactId: contactId }, `Rechnung ${f.invoiceNumber ?? f.stripeInvoiceId} bezahlt, Mahnlauf beendet`, `${eurCent(f.amountDue)} · ${via === "bank" ? "Eingang auf dem Geschäftskonto" : via === "manuell" ? "von Hand bestätigt" : "über Stripe"}`);
  }
  return true;
}

/** Rechnung in Stripe nicht mehr offen (storniert, uneinbringlich): Fall ohne Zahlung schließen. */
async function fallSchliessen(id: string, grund: string) {
  await prisma.mahnfall.updateMany({ where: { id, status: "offen" }, data: { status: "geschlossen", lastError: grund } });
}

/**
 * Abgleich mit Stripe (stündlich im Mahnlauf): offene Überweisungs-Rechnungen als Fälle anlegen, offene Fälle
 * prüfen (bezahlt, storniert, Betrag). Fehlgeschlagene Abbuchungen kommen nur über den Webhook (eine laufende
 * SEPA-Lastschrift ist in Stripe ebenfalls „offen“).
 */
export async function syncOffeneRechnungen(now = new Date()): Promise<{ neu: number; geprueft: number; geschlossen: number }> {
  const out = { neu: 0, geprueft: 0, geschlossen: 0 };
  const stripe = stripeClient();
  if (!stripe || !mahnwesenAktiv()) return out;
  const seen = new Set<string>();
  for await (const inv of stripe.invoices.list({ status: "open", collection_method: "send_invoice", limit: 100 })) {
    if (!inv.id) continue;
    seen.add(inv.id);
    const before = await prisma.mahnfall.findUnique({ where: { stripeInvoiceId: inv.id }, select: { id: true } });
    const id = await mahnfallAusRechnung(inv, { now });
    if (id && !before) out.neu++;
  }
  const offen = await prisma.mahnfall.findMany({ where: { status: "offen" }, take: 100, orderBy: { updatedAt: "asc" } });
  for (const f of offen) {
    if (seen.has(f.stripeInvoiceId)) continue;
    out.geprueft++;
    try {
      const inv = await stripe.invoices.retrieve(f.stripeInvoiceId);
      if (inv.status === "paid") {
        await rechnungBezahlt(f.stripeInvoiceId, "stripe", now);
        out.geschlossen++;
      } else if (inv.status === "void" || inv.status === "uncollectible") {
        await fallSchliessen(f.id, inv.status === "void" ? "In Stripe storniert" : "In Stripe als uneinbringlich markiert");
        out.geschlossen++;
      } else {
        await prisma.mahnfall.update({ where: { id: f.id }, data: { amountDue: inv.amount_remaining ?? f.amountDue } });
      }
    } catch (err) {
      reportError(err, "mahnwesen-sync", { invoice: f.stripeInvoiceId });
    }
  }
  // Fälle ohne Kundenzuordnung nachziehen (Kunde entsteht erst beim Onboarding)
  const ohne = await prisma.mahnfall.findMany({ where: { status: "offen", customerId: null }, select: { id: true, stripeCustomerId: true } });
  for (const f of ohne) {
    const c = await prisma.customer.findUnique({ where: { stripeCustomerId: f.stripeCustomerId }, select: { id: true } });
    if (c) await prisma.mahnfall.update({ where: { id: f.id }, data: { customerId: c.id } });
  }
  return out;
}

// ─── Mahnlauf ────────────────────────────────────────────────────────────

export type MahnlaufErgebnis = { aktiv: boolean; faelle: number; mails: number; whatsapp: number; aufgaben: number; abgleich?: Awaited<ReturnType<typeof bankAbgleichLauf>>; sync?: Awaited<ReturnType<typeof syncOffeneRechnungen>> };

const STUFE_FELD: Record<Stufe["key"], "erinnertAt" | "faelligAt" | "mahnung1At" | "mahnung2At" | "anrufAufgabeAt"> = {
  erinnerung: "erinnertAt",
  faellig: "faelligAt",
  mahnung1: "mahnung1At",
  mahnung2: "mahnung2At",
  anruf: "anrufAufgabeAt",
};

/** Im WhatsApp-Cron: stündlich Stripe- und Bankabgleich, dann je offenem Fall die fällige Stufe (9 bis 19 Uhr). */
export async function runMahnlauf(now = new Date(), opts: { abgleich?: boolean } = {}): Promise<MahnlaufErgebnis> {
  const out: MahnlaufErgebnis = { aktiv: mahnwesenAktiv(), faelle: 0, mails: 0, whatsapp: 0, aufgaben: 0 };
  if (!out.aktiv) return out;
  if (opts.abgleich ?? now.getUTCMinutes() < 5) {
    out.sync = await syncOffeneRechnungen(now).catch((err) => {
      reportError(err, "mahnwesen-sync");
      return undefined;
    });
    out.abgleich = await bankAbgleichLauf(now).catch((err) => {
      reportError(err, "mahnwesen-bankabgleich");
      return undefined;
    });
  }
  const faelle = await prisma.mahnfall.findMany({
    where: { status: "offen" },
    include: { customer: { select: { id: true, name: true, isTest: true, mahnStopp: true, salesContact: { select: { id: true, name: true } }, users: { where: { role: "BUYER", teamRole: "owner" }, select: { email: true } } } } },
    orderBy: { dueDate: "asc" },
    take: 300,
  });
  for (const f of faelle) {
    out.faelle++;
    try {
      const n = naechsteStufe(f, now, { gestoppt: !!mahnStoppGrund(f.customer) });
      if (!jetztAusfuehren(n, now) || !n) continue;
      // Stufe beanspruchen (zwei Läufe gleichzeitig senden nicht doppelt)
      const claimed = await prisma.mahnfall.updateMany({
        where: { id: f.id, stufe: f.stufe, status: "offen" },
        data: { stufe: n.stufe.nr, [STUFE_FELD[n.stufe.key]]: now, ...(n.stufe.mail ? { letzteMailAt: now } : {}) },
      });
      if (claimed.count !== 1) continue;
      const r = await fuehreStufeAus(f, n.stufe, now);
      if (r.mail) out.mails++;
      if (r.whatsapp) out.whatsapp++;
      if (r.aufgabe) out.aufgaben++;
    } catch (err) {
      reportError(err, "mahnwesen", { invoice: f.stripeInvoiceId });
      await prisma.mahnfall.update({ where: { id: f.id }, data: { lastError: (err instanceof Error ? err.message : String(err)).slice(0, 300) } }).catch(() => {});
    }
  }
  return out;
}

type FallMitKunde = NonNullable<Awaited<ReturnType<typeof prisma.mahnfall.findFirst>>> & {
  customer: { id: string; name: string; salesContact: { id: string; name: string } | null; users: { email: string }[] } | null;
};

async function fuehreStufeAus(f: FallMitKunde, stufe: Stufe, now: Date): Promise<{ mail: boolean; whatsapp: boolean; aufgabe: boolean }> {
  const res = { mail: false, whatsapp: false, aufgabe: false };
  const kunde = f.customer?.name ?? f.email ?? f.stripeCustomerId;
  const nummer = f.invoiceNumber ?? f.stripeInvoiceId;
  const contactId = f.customer?.salesContact?.id ?? null;
  const ref = { dealId: null, salesContactId: contactId };
  if (stufe.key === "anruf") {
    const t = anrufAufgabe({ kunde, nummer, betragCent: f.amountDue, dueDate: f.dueDate });
    const task = await prisma.salesTask.create({ data: { contactId, type: "ANRUF", title: t.title, note: t.note, dueAt: now } });
    await prisma.mahnfall.update({ where: { id: f.id }, data: { anrufAufgabeId: task.id } });
    await sendToAdmins({ title: `📞 Kunde anrufen: ${kunde}`, body: `Rechnung ${nummer} · ${eurCent(f.amountDue)} seit ${tageUeberfaellig(f.dueDate, now)} Tagen offen`, url: "/admin/neu/zahlen/offene-posten", tag: `mahnung:${f.id}` }).catch(() => {});
    if (contactId) await logOfferActivity(ref, `Aufgabe „Kunde anrufen“: Rechnung ${nummer} seit 21 Tagen offen`);
    res.aufgabe = true;
    return res;
  }
  const to = f.email ? [f.email] : (f.customer?.users ?? []).map((u) => u.email);
  const text = mahnText(stufe.key, { nummer, betragCent: f.amountDue, dueDate: f.dueDate, art: f.art, now });
  if (to.length) {
    const anhang = stufe.key === "mahnung1" || stufe.key === "mahnung2" ? await rechnungPdf(f.pdfUrl, nummer) : null;
    const sent = await sendCustomerMail({
      to,
      subject: text.subject,
      greeting: await customerGreeting({ salesContactId: contactId, contactName: f.customer?.salesContact?.name ?? null }),
      paragraphs: anhang || !(stufe.key === "mahnung1" || stufe.key === "mahnung2") ? text.paragraphs : text.paragraphs.map((p) => p.replace(" Die Rechnung finden Sie im Anhang.", "").replace(" Die Rechnung finden Sie noch einmal im Anhang.", "")),
      ...(f.hostedUrl ? { button: { label: text.button, url: f.hostedUrl } } : {}),
      ...(anhang ? { attachments: [anhang] } : {}),
    });
    res.mail = sent.ok;
    if (!sent.ok) await prisma.mahnfall.update({ where: { id: f.id }, data: { lastError: `Mail: ${sent.error}`.slice(0, 300) } });
    if (contactId) {
      await logOfferActivity(ref, sent.ok ? `${stufe.label} zu Rechnung ${nummer} per E-Mail gesendet` : `${stufe.label} zu Rechnung ${nummer}: E-Mail fehlgeschlagen`, sent.ok ? `Betreff: ${text.subject}` : sent.error, null, "EMAIL");
    }
  } else {
    await prisma.mahnfall.update({ where: { id: f.id }, data: { lastError: "Keine E-Mail-Adresse" } });
  }
  if (stufe.key === "faellig" && f.hostedUrl) {
    const { sendeVorlageAnKontakt } = await import("@/lib/angebot-zahlungserinnerung-server");
    const vorlage = rechnungVorlage(f.art);
    const wa = await sendeVorlageAnKontakt({
      salesContactId: contactId,
      contactName: f.customer?.salesContact?.name ?? kunde,
      du: false,
      vorlage: async () => ((await vorlageFreigegeben(vorlage.name)) ? vorlage : null),
      params: (anrede) => [anrede, nummer, eurCent(f.amountDue), f.hostedUrl!],
      activity: `Zahlungserinnerung zu Rechnung ${nummer} per WhatsApp gesendet`,
      logRef: ref,
      errorLabel: "mahnwesen-whatsapp",
      now,
    });
    res.whatsapp = wa === "sent";
  }
  if (stufe.key === "mahnung2") {
    await sendToAdmins({ title: `💶 2. Mahnung raus: ${kunde}`, body: `Rechnung ${nummer} · ${eurCent(f.amountDue)}, fällig seit ${fmtDatum(f.dueDate)}`, url: "/admin/neu/zahlen/offene-posten", tag: `mahnung:${f.id}` }).catch(() => {});
  }
  return res;
}

/** WhatsApp-Vorlage der Support-Nummer freigegeben? (Mahn-Vorlagen sind nur vorbereitet, siehe lib/mahnwesen.ts) */
async function vorlageFreigegeben(name: string): Promise<boolean> {
  const { SUPPORT_CUSTOMER_ID } = await import("@/lib/whatsapp/support-inbox");
  const t = await prisma.messageTemplate.findUnique({ where: { customerId_name_language: { customerId: SUPPORT_CUSTOMER_ID, name, language: "de" } }, select: { status: true } });
  return t?.status === "approved";
}

/** Rechnung als PDF-Anhang (Stripe-Link), null wenn nicht abrufbar (dann nur der Knopf). */
async function rechnungPdf(url: string | null, nummer: string): Promise<{ filename: string; content: Buffer; contentType: string } | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.subarray(0, 4).toString() !== "%PDF") return null;
    return { filename: `Rechnung-${nummer.replace(/[^A-Za-z0-9-]/g, "_")}.pdf`, content: buf, contentType: "application/pdf" };
  } catch (err) {
    reportError(err, "mahnwesen-pdf");
    return null;
  }
}

// ─── Stopp je Kunde ──────────────────────────────────────────────────────

export async function setzeMahnStopp(customerId: string, stop: boolean, grund: string | null, actor?: AuditActor): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, mahnStopp: true, mahnStoppGrund: true } });
  if (!c) return { ok: false, error: "Kunde nicht gefunden." };
  const g = grund?.trim().slice(0, 200) || null;
  if (c.mahnStopp === stop && (!stop || c.mahnStoppGrund === g)) return { ok: true };
  await prisma.customer.update({ where: { id: c.id }, data: { mahnStopp: stop, mahnStoppGrund: stop ? g : null, mahnStoppAt: stop ? new Date() : null } });
  await audit("billing.mahnstopp", { entity: "Customer", entityId: c.id, customerId: c.id, actor, details: { stopp: { from: c.mahnStopp, to: stop }, grund: g } });
  return { ok: true };
}

// ─── Bankabgleich (Überweisung aufs Geschäftskonto) ──────────────────────

const ABGLEICH_TAGE = 45;

/**
 * Eingänge auf dem Geschäftskonto (Enable Banking) gegen offene Fälle: eindeutig (Betrag und Rechnungsnummer)
 * → Rechnung in Stripe „außerhalb von Stripe bezahlt“ markieren und Mahnlauf stoppen; unsicher → Vorschlag im Admin.
 * Auszahlungen von Stripe selbst werden übersprungen.
 */
export async function bankAbgleichLauf(now = new Date()): Promise<{ geprueft: number; zugeordnet: number; vorschlaege: number }> {
  const out = { geprueft: 0, zugeordnet: 0, vorschlaege: 0 };
  const faelle = await prisma.mahnfall.findMany({ where: { status: "offen" }, select: { id: true, amountDue: true, invoiceNumber: true, customer: { select: { name: true } } } });
  if (!faelle.length) return out;
  const txs = await prisma.bankTransaction.findMany({
    where: { amount: { gt: 0 }, mahnfallId: null, bookingDate: { gte: new Date(now.getTime() - ABGLEICH_TAGE * 86_400_000) } },
    orderBy: { bookingDate: "desc" },
    take: 500,
  });
  const offen = faelle.map((f) => ({ id: f.id, amountDue: f.amountDue, invoiceNumber: f.invoiceNumber, kunde: f.customer?.name ?? null }));
  for (const tx of txs) {
    if (/stripe/i.test(`${tx.counterparty ?? ""} ${tx.purpose ?? ""}`)) continue;
    out.geprueft++;
    const r = bankAbgleich({ amount: Number(tx.amount), purpose: tx.purpose, counterparty: tx.counterparty }, offen);
    if (r.eindeutig) {
      const ok = await alsBezahltMarkieren(r.eindeutig, tx.id, null, now).catch((err) => {
        reportError(err, "mahnwesen-bank-eindeutig", { tx: tx.id });
        return false;
      });
      if (ok) {
        out.zugeordnet++;
        const i = offen.findIndex((f) => f.id === r.eindeutig);
        if (i >= 0) offen.splice(i, 1);
        continue;
      }
      r.vorschlaege.push({ id: r.eindeutig, grund: "Betrag und Rechnungsnummer passen, Markieren in Stripe fehlgeschlagen" });
    }
    if (r.vorschlaege.length) {
      const neu = await prisma.zahlungsVorschlag.createMany({
        data: r.vorschlaege.map((v) => ({ mahnfallId: v.id, bankTransactionId: tx.id, grund: v.grund })),
        skipDuplicates: true,
      });
      out.vorschlaege += neu.count;
    }
  }
  if (out.vorschlaege > 0) {
    await sendToAdmins({ title: "🏦 Zahlungseingang prüfen", body: `${out.vorschlaege} möglicher Eingang zu offenen Rechnungen, bitte bestätigen.`, url: "/admin/neu/zahlen/offene-posten", tag: "zahlungsabgleich" }).catch(() => {});
  }
  return out;
}

/** Fall als bezahlt markieren: in Stripe „paid out of band“, Buchung verknüpfen, Mahnlauf stoppen. */
async function alsBezahltMarkieren(mahnfallId: string, bankTransactionId: string, actor: AuditActor | null, now: Date): Promise<boolean> {
  const f = await prisma.mahnfall.findUnique({ where: { id: mahnfallId } });
  if (!f || f.status !== "offen") return false;
  const stripe = stripeClient();
  if (!stripe) throw new Error("Stripe ist nicht eingerichtet.");
  const inv = await stripe.invoices.retrieve(f.stripeInvoiceId);
  if (inv.status === "open") await stripe.invoices.pay(f.stripeInvoiceId, { paid_out_of_band: true }, { idempotencyKey: `mahnfall-oob-${f.id}` });
  else if (inv.status !== "paid") throw new Error(`Rechnung ist in Stripe ${inv.status}`);
  await prisma.bankTransaction.update({ where: { id: bankTransactionId }, data: { mahnfallId: f.id, note: `Zahlung zu Rechnung ${f.invoiceNumber ?? f.stripeInvoiceId}` } });
  await prisma.zahlungsVorschlag.updateMany({ where: { mahnfallId: f.id, status: "offen", bankTransactionId: { not: bankTransactionId } }, data: { status: "verworfen", entschiedenAt: now, entschiedenVon: "automatisch (Rechnung bezahlt)" } });
  await rechnungBezahlt(f.stripeInvoiceId, actor ? "manuell" : "bank", now);
  await audit("billing.zahlungsabgleich", {
    entity: "Mahnfall",
    entityId: f.id,
    customerId: f.customerId,
    actor: actor ?? { role: "system" },
    details: { rechnung: f.invoiceNumber ?? f.stripeInvoiceId, buchung: bankTransactionId, automatisch: !actor },
  });
  return true;
}

export async function vorschlagEntscheiden(id: string, bestaetigen: boolean, actor: AuditActor): Promise<{ ok: true } | { ok: false; error: string }> {
  const v = await prisma.zahlungsVorschlag.findUnique({ where: { id } });
  if (!v || v.status !== "offen") return { ok: false, error: "Vorschlag nicht mehr offen." };
  const now = new Date();
  if (bestaetigen) {
    try {
      const ok = await alsBezahltMarkieren(v.mahnfallId, v.bankTransactionId, actor, now);
      if (!ok) return { ok: false, error: "Die Rechnung ist nicht mehr offen." };
    } catch (err) {
      reportError(err, "mahnwesen-vorschlag", { vorschlag: id });
      return { ok: false, error: `Stripe: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
  await prisma.zahlungsVorschlag.update({ where: { id }, data: { status: bestaetigen ? "bestaetigt" : "verworfen", entschiedenAt: now, entschiedenVon: actor.email ?? actor.id ?? "admin" } });
  return { ok: true };
}

// ─── Übersicht ───────────────────────────────────────────────────────────

export type OffenerPosten = {
  id: string;
  kunde: string;
  customerId: string | null;
  nummer: string;
  betrag: number;
  art: string;
  faellig: string;
  tage: number;
  stufe: number;
  stufeLabel: string;
  naechste: { label: string; tag: string } | null;
  gestoppt: string | null;
  hostedUrl: string | null;
  fehler: string | null;
};

export type OffenePosten = {
  aktiv: boolean;
  posten: OffenerPosten[];
  summe: number;
  vorschlaege: { id: string; kunde: string; nummer: string; betrag: number; eingang: number; datum: string; von: string | null; zweck: string | null; grund: string }[];
  bezahlt: { kunde: string; nummer: string; betrag: number; datum: string; via: string | null }[];
  settings: { verzugspauschale: boolean; leadsPause: boolean };
};

export async function ladeOffenePosten(now = new Date(), opts: { customerId?: string } = {}): Promise<OffenePosten> {
  const where = { status: "offen", ...(opts.customerId ? { customerId: opts.customerId } : {}) };
  const [faelle, vorschlaege, bezahlt, settings] = await Promise.all([
    prisma.mahnfall.findMany({ where, include: { customer: { select: { id: true, name: true, isTest: true, mahnStopp: true } } }, orderBy: { dueDate: "asc" } }),
    prisma.zahlungsVorschlag.findMany({
      where: { status: "offen", mahnfall: { status: "offen", ...(opts.customerId ? { customerId: opts.customerId } : {}) } },
      include: { mahnfall: { include: { customer: { select: { name: true } } } }, bankTransaction: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.mahnfall.findMany({
      where: { status: "bezahlt", bezahltAt: { gte: new Date(now.getTime() - 30 * 86_400_000) }, ...(opts.customerId ? { customerId: opts.customerId } : {}) },
      include: { customer: { select: { name: true } } },
      orderBy: { bezahltAt: "desc" },
      take: 20,
    }),
    prisma.mahnwesenSettings.findUnique({ where: { id: "default" } }),
  ]);
  const posten = faelle.map((f): OffenerPosten => {
    const gestoppt = mahnStoppGrund(f.customer);
    const n = naechsteStufe(f, now, { gestoppt: !!gestoppt });
    return {
      id: f.id,
      kunde: f.customer?.name ?? f.email ?? f.stripeCustomerId,
      customerId: f.customerId,
      nummer: f.invoiceNumber ?? f.stripeInvoiceId,
      betrag: f.amountDue / 100,
      art: f.art,
      faellig: berlinTodayIso(f.dueDate),
      tage: tageUeberfaellig(f.dueDate, now),
      stufe: f.stufe,
      stufeLabel: stufeLabel(f.stufe),
      naechste: n ? { label: n.stufe.label, tag: n.tag } : null,
      gestoppt,
      hostedUrl: f.hostedUrl,
      fehler: f.lastError,
    };
  });
  return {
    aktiv: mahnwesenAktiv(),
    posten,
    summe: posten.reduce((s, p) => s + p.betrag, 0),
    vorschlaege: vorschlaege.map((v) => ({
      id: v.id,
      kunde: v.mahnfall.customer?.name ?? v.mahnfall.email ?? "",
      nummer: v.mahnfall.invoiceNumber ?? v.mahnfall.stripeInvoiceId,
      betrag: v.mahnfall.amountDue / 100,
      eingang: Number(v.bankTransaction.amount),
      datum: v.bankTransaction.bookingDate.toISOString().slice(0, 10),
      von: v.bankTransaction.counterparty,
      zweck: v.bankTransaction.purpose,
      grund: v.grund,
    })),
    bezahlt: bezahlt.map((f) => ({ kunde: f.customer?.name ?? f.email ?? "", nummer: f.invoiceNumber ?? f.stripeInvoiceId, betrag: f.amountDue / 100, datum: berlinTodayIso(f.bezahltAt!), via: f.bezahltVia })),
    settings: { verzugspauschale: settings?.verzugspauschale ?? false, leadsPause: settings?.leadsPause ?? false },
  };
}

/** Hat der Kunde einen offenen, nicht gestoppten Mahnfall? (alte 21-Tage-Warnung entfällt dann) */
export async function kundeImMahnlauf(customerId: string): Promise<boolean> {
  if (!mahnwesenAktiv()) return false;
  return !!(await prisma.mahnfall.findFirst({ where: { customerId, status: "offen", customer: { mahnStopp: false } }, select: { id: true } }));
}

export async function mahnwesenSettings(): Promise<{ verzugspauschale: boolean; leadsPause: boolean }> {
  const s = await prisma.mahnwesenSettings.findUnique({ where: { id: "default" } });
  return { verzugspauschale: s?.verzugspauschale ?? false, leadsPause: s?.leadsPause ?? false };
}

/** Link auf die Übersicht (Push, Aufgaben). */
export const OFFENE_POSTEN_PFAD = "/admin/neu/zahlen/offene-posten";
export const offenePostenUrl = () => `${getAppUrl()}${OFFENE_POSTEN_PFAD}`;
