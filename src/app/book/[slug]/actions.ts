"use server";

import { recordUsage } from "@/lib/usage";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { buildEventDescription, eventSummary } from "@/lib/whatsapp/event-text";
import { bookAppointment, SlotBusyError } from "@/lib/calendar";
import { linkLeadToConversation } from "@/lib/whatsapp/lead-link";
import { sendBookingConfirmation } from "@/lib/whatsapp/reminders";
import { EMAIL_RE, normalizePhone } from "@/lib/whatsapp/phone";
import { checkLimit, requestIp } from "@/lib/rate-limit";

// Öffentliche Buchung (Buchungsseite / Meta-Leadformular). Kein Login — daher
// alles serverseitig validieren, Slot direkt vor dem Anlegen neu prüfen
// (bookAppointment) und einfache Missbrauchsbremsen setzen.

const MAX_BOOKINGS_PER_10_MIN = 10;

export async function bookPublicAction(
  slug: string,
  formData: FormData,
): Promise<void> {
  // Buchungslink aus dem WhatsApp-Chat (lib/whatsapp/buchungslink.ts): Token bleibt bei Fehlern erhalten
  const chatToken = String(formData.get("c") ?? "");
  const fail = (code: string): never => redirect(`/book/${slug}?${chatToken ? `c=${encodeURIComponent(chatToken)}&` : ""}err=${code}`);
  if (!checkLimit("publicBooking", await requestIp()).ok) fail("busy");

  // Bot-Falle: unsichtbares Feld ausgefüllt UND blitzschnell abgeschickt.
  // Nur beides zusammen gilt als Bot — Autofill allein darf echte Leads
  // nicht blockieren (Menschen brauchen für das Formular weit über 3 s).
  const honeypot = String(formData.get("zq_hp_field") ?? "").trim();
  const renderedAt = Number(formData.get("rendered_at") ?? 0);
  const tooFast = !renderedAt || Date.now() - renderedAt < 3000;
  if (honeypot && tooFast) fail("invalid");

  const conn = await prisma.calendarConnection.findUnique({
    where: { bookingSlug: slug },
    select: { customerId: true, status: true, customer: { select: { leadAddress: true } } },
  });
  if (!conn || conn.status !== "connected") fail("unavailable");
  const customerId = conn!.customerId;

  const start = String(formData.get("start") ?? "");
  // Video ist Standard (Ole, 20.11.2026); Telefon nur, wenn der Vermittler es freigegeben hat
  const { agenturOrt, loadTerminFormate } = await import("@/lib/termin-formate-server");
  const formate = await loadTerminFormate(customerId).catch(() => ({ telefon: false, vorOrt: false }));
  const wunsch = formData.get("mode");
  // „In der Agentur“ nur freigegeben und mit Anschrift (Ole, 20.11.2026)
  const ort = wunsch === "onsite" && formate.vorOrt ? await agenturOrt(customerId).catch(() => null) : null;
  const mode: "phone" | "video" | "onsite" = wunsch === "phone" && formate.telefon ? "phone" : ort ? "onsite" : "video";
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  let phone = normalizePhone(String(formData.get("phone") ?? ""));
  // Chat-Kontext: gebucht wird über die WhatsApp-Nummer des Chats, damit Termin, Lead und Strecke im selben Chat landen
  if (chatToken) {
    const { pruefeChatBuchungToken } = await import("@/lib/whatsapp/buchungslink");
    const cid = pruefeChatBuchungToken(chatToken);
    const c = cid ? await prisma.conversation.findUnique({ where: { id: cid }, select: { customerId: true, contactPhone: true } }) : null;
    if (!c || c.customerId !== customerId) fail("invalid");
    phone = c!.contactPhone;
  }
  const emailRaw = String(formData.get("email") ?? "").trim().toLowerCase();
  // Splittest buchungsseite_kompakt (lib/experimente.ts): Fassung b ohne Pflicht-Haken, Datenschutz als Hinweis am
  // Knopf (Verarbeitung zur Terminvereinbarung nach Art. 6 Abs. 1 lit. b DSGVO, keine Einwilligung nötig)
  const consent = formData.get("consent") === "on" || formData.get("datenschutz") === "hinweis";
  // Häkchen nur, wenn die Seite es gezeigt hat (Lead bucht selbst, Feld „xe“ = Aufruf-ID des Splittests buchung_erinnerung)
  const erinnerungAufruf = seitenAufruf(formData.get("xe"));
  const erinnerungFassung: "a" | "b" = formData.get("erinnerung_fassung") === "b" ? "b" : "a";
  const erinnerung = !!erinnerungAufruf && formData.get("erinnerung") === "on";
  const aufruf = seitenAufruf(formData.get("xv"));

  if (!start || Number.isNaN(new Date(start).getTime())) fail("slot");
  if (!name) fail("name");
  // Lead-Kontext aus der Mail-Strecke (Link „Andere Zeit“, lib/mail-strecke): Lead bekannt, Telefon freiwillig
  const streckeToken = String(formData.get("t") ?? "");
  if (streckeToken) {
    const { pruefeStreckenToken } = await import("@/lib/mail-strecke/token");
    const streckeId = pruefeStreckenToken(streckeToken);
    if (!streckeId) fail("invalid");
    await bookViaStrecke(slug, customerId, streckeId!, streckeToken, { start, mode, ort, name, phone, email: emailRaw, consent, aufruf });
  }
  if (!phone) fail("phone");
  if (!EMAIL_RE.test(emailRaw)) fail("email");
  if (!consent) fail("consent");

  // Missbrauchsbremse je Kunde.
  const recent = await prisma.appointment.count({
    where: {
      customerId,
      createdAt: { gt: new Date(Date.now() - 10 * 60 * 1000) },
    },
  });
  if (recent >= MAX_BOOKINGS_PER_10_MIN) fail("busy");

  // Konversation über die Telefonnummer zuordnen (gleiche Nummer wie WhatsApp).
  const account = await prisma.whatsAppAccount.findUnique({
    where: { customerId },
    select: { id: true },
  });
  const conversation = await prisma.conversation.upsert({
    where: { customerId_contactPhone: { customerId, contactPhone: phone! } },
    create: {
      customerId,
      whatsAppAccountId: account?.id ?? null,
      contactPhone: phone!,
      contactName: name,
      contactEmail: emailRaw,
    },
    // Bestehenden Kontakt hier NICHT überschreiben — erst nach der
    // Doppelbuchungs-Prüfung (sonst ändert ein abgewiesener Versuch Name/E-Mail).
    update: {},
    select: { id: true, qualificationSummary: true },
  });
  await linkLeadToConversation(conversation.id).catch((e) =>
    console.error("[booking page lead-link]", e),
  );
  const linked = await prisma.conversation.findUnique({
    where: { id: conversation.id },
    select: { leadId: true, lead: { select: { source: true } } },
  });
  const product = linked?.lead?.source ?? null;
  const leadId = linked?.leadId ?? null;

  // Pro Lead nur ein offener Termin.
  const existing = await prisma.appointment.findFirst({
    where: {
      conversationId: conversation.id,
      status: "booked",
      startsAt: { gt: new Date() },
    },
    select: { id: true },
  });
  // Pro Telefonnummer (= Kontakt/WhatsApp-Chat) ein offener Termin — nicht
  // pro Name: Gleichnamige Personen mit anderer Nummer buchen problemlos.
  if (existing) redirect(`/book/${slug}?ok=1&a=${existing.id}&dup=1`);
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { contactName: name, contactEmail: emailRaw },
  });

  let appointmentId: string;
  try {
    const res = await bookAppointment({
      customerId,
      leadId,
      conversationId: conversation.id,
      start,
      mode,
      ort,
      summary: eventSummary(mode, name, product),
      description: buildEventDescription({
        name,
        phone: phone!,
        email: emailRaw,
        product,
        mode,
        summary: conversation.qualificationSummary,
        conversationId: conversation.id,
        bookedVia: "booking_page",
      }),
      attendeeEmail: emailRaw,
      leadName: name,
      leadPhone: phone,
    });
    appointmentId = res.appointmentId;
    if (aufruf) await import("@/lib/experimente").then((m) => m.ereignis("buchungsseite_kompakt", aufruf, "termin_gebucht")).catch(() => null);
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "internal",
        kind: "appointment_booked",
        body: JSON.stringify({ via: "booking_page", modus: mode, start }),
        sentBy: "lead",
      },
    });
    // Opt-in für Erinnerungen zur Terminvorbereitung (Policen, Rechtsprüfung A8): nur wenn angehakt, als Nachweis
    // Gespeichert wird genau der gezeigte Wortlaut (Fassung aus dem Formular).
    if (erinnerung) {
      const { asAnsprache } = await import("@/lib/ansprache");
      await import("@/lib/policen/server")
        .then((m) => m.erinnerungOptIn({ customerId, leadId, phone: phone!, fassung: erinnerungFassung, an: asAnsprache(conn!.customer.leadAddress) }))
        .catch((e) => console.error("[booking page erinnerung]", e instanceof Error ? e.name : "Fehler"));
    }
    // Splittest buchung_erinnerung: Zuteilung je Buchung, Ziel „erinnerung_optin“ nur, wenn die gezeigte Fassung passt
    if (erinnerungAufruf) {
      await import("@/lib/experimente")
        .then(async (m) => {
          const v = await m.variante("buchung_erinnerung", erinnerungAufruf);
          if (erinnerung && v === erinnerungFassung) await m.ereignis("buchung_erinnerung", erinnerungAufruf, "erinnerung_optin");
        })
        .catch(() => null);
    }
    // WhatsApp-Bestätigung (Freitext im 24h-Fenster, sonst freigegebene
    // Vorlage). Fehler dürfen die Buchung nicht scheitern lassen — die
    // Google-Einladung per E-Mail ist ohnehin raus.
    await sendBookingConfirmation({
      customerId,
      to: phone!,
      name,
      leadId,
      startsAt: new Date(res.start),
      mode,
      ort,
      meetUrl: res.meetUrl,
      manageUrl: res.manageUrl,
    }).catch((e) => console.error("[booking page confirmation]", e));
  } catch (err) {
    if (err instanceof SlotBusyError) fail("taken");
    console.error("[booking page]", err);
    fail("error");
  }

  // Bucht ein eingeloggter Berater für einen Lead (Rückrufliste) → mitzählen.
  // Für Leads ohne Sitzung schreibt recordUsage nichts.
  await recordUsage("action", "appointment.book_by_advisor");
  redirect(`/book/${slug}?ok=1&a=${appointmentId!}`);
}

/**
 * Buchung mit Lead-Kontext aus der Mail-Strecke (Ole, 18.11.2026, E3): Lead steht fest (kein Abgleich über die Nummer),
 * Telefon ist freiwillig. Danach weiter auf der Antwortseite (Komplettcheck, Angaben, Bereitlegen).
 */
async function bookViaStrecke(
  slug: string,
  customerId: string,
  streckeId: string,
  token: string,
  f: { start: string; mode: "phone" | "video" | "onsite"; ort: string | null; name: string; phone: string | null; email: string; consent: boolean; aufruf: string | null },
): Promise<never> {
  const fail = (code: string): never => redirect(`/book/${slug}?t=${encodeURIComponent(token)}&err=${code}`);
  if (!EMAIL_RE.test(f.email)) fail("email");
  if (!f.consent) fail("consent");
  if (f.mode === "phone" && !f.phone) fail("phone");
  const s = await prisma.leadMailStrecke.findUnique({ where: { id: streckeId }, select: { id: true, leadId: true, customerId: true, appointmentId: true } });
  if (!s || s.customerId !== customerId) fail("invalid");
  const lead = await prisma.lead.findUnique({ where: { id: s!.leadId }, select: { id: true, phone: true, email: true, source: true, erasedAt: true } });
  if (!lead || lead.erasedAt) fail("invalid");
  const existing = await prisma.appointment.findFirst({ where: { leadId: lead!.id, status: "booked", startsAt: { gt: new Date() } }, select: { id: true } });
  if (existing) redirect(`/t/${token}`);
  // Doppelklick: nur ein Lauf zur Zeit (wie auf der Antwortseite)
  const claim = await prisma.leadMailStrecke.updateMany({ where: { id: s!.id, appointmentId: null, OR: [{ buchungAt: null }, { buchungAt: { lt: new Date(Date.now() - 120_000) } }] }, data: { buchungAt: new Date() } });
  if (!claim.count) redirect(`/t/${token}`);
  const phone = lead!.phone ?? f.phone;
  if (!lead!.phone && f.phone) await prisma.lead.update({ where: { id: lead!.id }, data: { phone: f.phone } });
  if (lead!.email?.toLowerCase() !== f.email) {
    const { mitNeuerEmail } = await import("@/lib/lead-emails");
    const l = await prisma.lead.findUnique({ where: { id: lead!.id }, select: { email: true, weitereEmails: true } });
    await prisma.lead.update({ where: { id: lead!.id }, data: mitNeuerEmail({ alt: l?.email, weitere: l?.weitereEmails, neu: f.email }) });
  }
  const conv = phone ? await prisma.conversation.findUnique({ where: { customerId_contactPhone: { customerId, contactPhone: phone } }, select: { id: true } }) : null;
  try {
    const res = await bookAppointment({
      customerId,
      leadId: lead!.id,
      conversationId: conv?.id ?? null,
      start: f.start,
      mode: f.mode,
      ort: f.ort,
      summary: eventSummary(f.mode, f.name, lead!.source),
      description: buildEventDescription({ name: f.name, phone: phone ?? "", email: f.email, product: lead!.source, mode: f.mode, summary: null, conversationId: conv?.id ?? null, bookedVia: "mail_strecke" }),
      leadName: f.name,
      leadPhone: phone,
      bookedVia: "mail_strecke",
    });
    await prisma.leadMailStrecke.update({ where: { id: s!.id }, data: { appointmentId: res.appointmentId, gebuchtAt: new Date(), buchungAt: null, schritt: "gebucht", reaktionAt: new Date(), antwortAt: new Date() } });
    // Splittests: Buchung über die Seite, als Nächstes zeigt /t die Komplettcheck-Frage (Zuteilung beim Klick)
    await import("@/lib/experimente")
      .then(async (m) => {
        if (f.aufruf) await m.ereignis("buchungsseite_kompakt", f.aufruf, "termin_gebucht");
        await m.variante("komplettcheck_text", lead!.id);
      })
      .catch(() => null);
  } catch (err) {
    await prisma.leadMailStrecke.update({ where: { id: s!.id }, data: { buchungAt: null } }).catch(() => null);
    if (err instanceof SlotBusyError) fail("taken");
    console.error("[booking page strecke]", err instanceof Error ? err.message.slice(0, 120) : err);
    fail("error");
  }
  redirect(`/t/${token}`);
}

/** Seitenaufruf-ID für den Splittest der Buchungsseite (zufällige UUID je Aufruf, kein Bezug zur Person). */
function seitenAufruf(v: FormDataEntryValue | null): string | null {
  const x = typeof v === "string" ? v.trim() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x) ? x : null;
}

/**
 * Buchungsseite im Browser angezeigt (nach dem Laden, Skript): Zuteilung im Splittest buchungsseite_kompakt. Abrufe
 * ohne Skript (Link-Vorschau, Scanner) zählen so nicht mit.
 */
export async function buchungsseiteGezeigtAction(aufruf: string): Promise<void> {
  const id = seitenAufruf(aufruf);
  if (!id) return;
  if (!checkLimit("publicBooking", `gezeigt:${await requestIp()}`).ok) return;
  await import("@/lib/experimente").then((m) => m.variante("buchungsseite_kompakt", id)).catch(() => null);
}

/**
 * Komplettcheck auf der Bestätigungsseite (Ole, 19.11.2026: wer über /book bucht, wurde bisher nie gefragt). Termin über
 * den geheimen Verwaltungs-Token, nur einmal (komplettcheck noch offen), Ja: Termin verlängern bzw. Hinweis an den
 * Vermittler. Merker für die WhatsApp-Strecke, damit der Assistent nicht noch einmal fragt.
 */
export async function komplettcheckBuchungAction(slug: string, formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const ja = formData.get("ja") === "1";
  if (!token || !checkLimit("publicBooking", `kc:${await requestIp()}`).ok) redirect(`/book/${slug}`);
  const conn = await prisma.calendarConnection.findUnique({ where: { bookingSlug: slug }, select: { customerId: true } });
  const t = conn ? await prisma.appointment.findFirst({ where: { manageToken: token, customerId: conn.customerId }, select: { id: true, leadId: true, conversationId: true, customerId: true, status: true, startsAt: true } }) : null;
  if (!t) redirect(`/book/${slug}`);
  const now = new Date();
  const r =
    t!.status === "booked" && t!.startsAt > now
      ? await prisma.appointment.updateMany({ where: { id: t!.id, komplettcheck: null }, data: { komplettcheck: ja } })
      : { count: 0 };
  if (r.count) {
    if (t!.conversationId) {
      const { merke, STRECKE } = await import("@/lib/whatsapp/termin-strecke");
      await merke(t!.conversationId, STRECKE.komplettFrage, { appointmentId: t!.id, via: "buchungsseite" });
      await merke(t!.conversationId, STRECKE.komplett, { appointmentId: t!.id, ja, via: "buchungsseite" });
    }
    if (t!.leadId) {
      const { logLeadHistory } = await import("@/lib/lead-history");
      await logLeadHistory(t!.leadId, "notiz", ja ? "Komplettcheck gewünscht (Buchungsseite)" : "Kein Komplettcheck gewünscht (Buchungsseite)", { customerId: t!.customerId, userId: null }).catch(() => null);
    }
    if (ja) {
      await import("@/lib/komplettcheck-dauer").then((m) => m.komplettcheckVerlaengern(t!.id, { now })).catch(() => null);
      await import("@/lib/experimente").then((m) => m.zielErreicht([t!.leadId, t!.conversationId, t!.id], "komplettcheck_ja")).catch(() => null);
    }
  }
  // Chat läuft danach von selbst weiter (Angebotsfragen, Vertragsfrage, Policen), Ole 20.11.2026
  if (r.count && t!.conversationId) {
    await import("@/lib/whatsapp/termin-strecke")
      .then((m) => m.weiterNachBuchungsseite(t!.conversationId!, t!.id, now))
      .catch((e) => console.error("[booking page strecke]", e instanceof Error ? e.message.slice(0, 160) : e));
  }
  redirect(`/book/${slug}?ok=1&a=${t!.id}&kc=${ja ? "1" : "0"}`);
}
