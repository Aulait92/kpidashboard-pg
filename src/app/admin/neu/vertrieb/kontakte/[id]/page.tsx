import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ClipboardCheck, FilePlus2, Mail, Phone } from "lucide-react";
import { Badge, ButtonLink, Card, CardHeader, buttonClass } from "@/components/ui";
import { DealOffersCard } from "@/components/deal-offers-card";
import { EintragenKnopf } from "@/components/admin-neu/vertrieb/eintragen-knopf";
import { ContactMore, StagePicker } from "@/components/vertrieb/contact-controls";
import { DuplicateHint } from "@/components/vertrieb/contact-merge";
import { DatenschutzRechtKarte } from "@/components/vertrieb/datenschutz-recht";
import { fallZeilen, rechtsFaelleVon } from "@/lib/vertrieb/datenschutz-recht-server";
import { FollowupBadge, FollowupCard } from "@/components/vertrieb/followup-card";
import { OnboardingCard, StartOnboardingCard } from "@/components/vertrieb/onboarding-card";
import { TaskForm } from "@/components/vertrieb/task-form";
import { TaskRow } from "@/components/vertrieb/ui";
import { Seite } from "@/components/admin-neu/ui/seite";
import { ColdMails, Daten, NaechsterSchritt, Verlauf, hatAntwort, offeneNachfrage } from "@/components/admin-neu/vertrieb/kontakt-karten";
import { KONTAKTE, VERTRIEB_NEU_LISTE, VERTRIEB_NEU_LISTEN, kontaktPfad } from "@/components/admin-neu/vertrieb/listen";
import { neuerPfad } from "@/lib/admin-neu/umzug";
import type { ImpressumInfo } from "@/lib/impressum";
import { eur } from "@/lib/offer-pricing";
import { toOfferRow } from "@/lib/offer-links";
import { offenesAngebot } from "@/lib/vertrieb/angebot-ablehnen";
import { onboardingChecklist } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import { CUSTOMER_LABEL, LOSS_LABEL, shortName } from "@/lib/vertrieb/crm";
import { fmtDate } from "@/lib/vertrieb/dates";
import { ladeKontakt, ladeKontaktakte } from "@/lib/vertrieb/kontaktakte";
import { audienceForContact } from "@/lib/vertrieb/praesentationen";

export const metadata = { title: "Kontakt | performancegrowth Admin" };

// Kontaktakte im neuen Admin. Hauptzweck: mit dem Kontakt weiterkommen (anrufen, Ergebnis erfassen, Termin, Angebot).
// Gleiche Daten wie die alte Akte (lib/vertrieb/kontaktakte.ts) und dieselben Bausteine und Server Actions.
// Umbau 19.11.2026 (SUS-Ziel 90): EINE Hauptaktion je Stufe im Kopf (hauptaktion unten), darunter Anrufen/E-Mail,
// „Eintragen“ (Anruf, Mail, Notiz im Fenster statt offenem Formular) und „Mehr“ (Präsentation, Website, Zusammenführen,
// Löschen). Reihenfolge: Nächster Schritt, Verlauf | Angebot (Optionen zugeklappt), Follow-up, Aufgaben, Daten
// (Kontakt, Agentur, Cold Mails, Kundendaten in einer zugeklappten Karte; Cold Mails mit Antwort stehen offen darüber).
// ?termin=<beliebig> öffnet „Termin buchen“ sofort („+ Neu → Termin“, Vertrieb → Termine).

const AKTE = [
  // Zurück führt zur zuletzt gefilterten Liste (Seite → zurueck.merken)
  "list-memory-backtolist--zurueck-link-merkt-gefilterte-liste-suche-filter",
  // Push an Admins (Buchung, Termin, Zahlung …) springt in die Kontaktakte
  "buchung--push-an-admins-mit-sprungziel-kontaktakte",
].join(" ");

export default async function KontaktaktePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ termin?: string }> }) {
  await requireAuth();
  const { id } = await params;
  const { termin } = await searchParams;
  const c = await ladeKontakt(id);
  if (!c) notFound();
  // „Offenes Angebot auch als abgelehnt markieren?“ beim Verloren-Markieren
  const offen = offenesAngebot(c.offers);
  const angebotOffen = offen ? { id: offen.id, number: offen.number } : null;
  // Kunden haben eine eigene Akte (Kunden → Kundenakte)
  if (c.customerId) redirect(neuerPfad(`/admin/kunden/${c.customerId}`, { nurFertige: false }) ?? `/admin/kunden/${c.customerId}`);
  const a = await ladeKontaktakte(c);
  const name = shortName(c.name);
  const pfad = kontaktPfad(c.id);
  const ansprechpartner = [c.salutation, c.firstName, c.lastName].filter(Boolean).join(" ");
  const adresse = [c.street, [c.zip, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  // „Wie lief der Termin?“ steht oben im Nächsten Schritt, nicht noch einmal unter Aufgaben
  const nachfrage = offeneNachfrage(a);
  const aufgaben = a.open.filter((t) => t !== nachfrage);
  const feedback = a.onboarding ? await prisma.customerFeedback.findMany({ where: { customerId: a.onboarding.customerId }, orderBy: { sentAt: "asc" } }) : [];
  // Datenschutz und Recht (Ole, 19.11.2026): Fälle mit Frist und Antwortvorlagen
  const rechtsFaelle = fallZeilen(await rechtsFaelleVon(c.id));

  const coldMailsOben = hatAntwort(c);
  const tel = c.phone ? `tel:${c.phone.replace(/\s/g, "")}` : null;
  const haupt = hauptaktion({ stage: c.stage, tel, email: c.email, angebotOffen: !!angebotOffen, nachfrage: !!nachfrage, angenommen: !!a.acceptedOffer, pfad });

  return (
    <Seite
      titel={name}
      untertitel={ansprechpartner || c.leaderNames ? `Ansprechpartner: ${ansprechpartner || c.leaderNames}` : undefined}
      zurueck={{ href: KONTAKTE, label: "Kontakte", merken: { id: VERTRIEB_NEU_LISTE, listen: VERTRIEB_NEU_LISTEN } }}
      aktionen={
        haupt ? (
          <a href={haupt.href} className={buttonClass("primary", "md")} data-hauptaktion={haupt.art}>
            <haupt.icon className="h-4 w-4" /> {haupt.label}
          </a>
        ) : undefined
      }
    >
      <div className="space-y-5" data-funktion={AKTE}>
        {/* Stand und schnelle Wege: Stufe, dann Anrufen, E-Mail, Eintragen, Mehr */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-[color:var(--muted)]">
            <span data-funktion="actions-setstage--stufe-aendern-auswahl contact-controls-stagepicker--verloren-mit-grund-und-wettbewerber">
              <StagePicker contactId={c.id} stage={c.stage} competitor={c.competitor} offenesAngebot={angebotOffen} />
            </span>
            {a.activeFollowup ? (
              <a href="#follow-up">
                <FollowupBadge f={a.activeFollowup} />
              </a>
            ) : null}
            {c.customerStage ? <Badge tone="success">Kunde: {CUSTOMER_LABEL[c.customerStage]}</Badge> : null}
            {c.lossReason ? (
              <Badge tone="danger">
                {LOSS_LABEL[c.lossReason]}
                {c.competitor ? `, ${c.competitor}` : ""}
              </Badge>
            ) : null}
            {c.city ? <span>{c.city}</span> : null}
            {c.callAttempts ? (
              <span>
                {c.callAttempts} Anrufversuch{c.callAttempts === 1 ? "" : "e"}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="contents" data-funktion="page-tel--anrufen-und-e-mail-schreiben-aus-dem-kopf">
              {tel && haupt?.art !== "anrufen" ? (
                <a href={tel} className={buttonClass("secondary", "md")} aria-label={`Anrufen: ${c.phone}`}>
                  <Phone className="h-4 w-4" /> <span className="hidden sm:inline">{c.phone}</span>
                </a>
              ) : null}
              {c.email && haupt?.art !== "mail" ? (
                <a href={`mailto:${c.email}`} className={buttonClass("secondary", "md")} aria-label="E-Mail schreiben">
                  <Mail className="h-4 w-4" /> <span className="hidden sm:inline">E-Mail</span>
                </a>
              ) : null}
            </span>
            <EintragenKnopf contactId={c.id} hasOpenTasks={a.open.length > 0} offenesAngebot={angebotOffen} variant={haupt ? "secondary" : "primary"} />
            <span
              className="contents"
              data-praesentation-knopf
              data-funktion="contact-controls-contactmore--menue-website-linkedin-profil-oeffnen actions-deletecontact--kontakt-loeschen actions-mergecontactsaction--kontakte-zusammenfuehren-mit-suche-nach page--praesentation-oeffnen"
            >
              <ContactMore
                contactId={c.id}
                name={name}
                url={c.url}
                linkedinUrl={c.linkedinUrl}
                duplicates={a.duplicates}
                geloescht={!!c.art17GeloeschtAt}
                gesperrt={!!c.nieKontaktierenAt || rechtsFaelle.length > 0}
                praesentationHref={`${pfad}/praesentation`}
              />
            </span>
            {a.praesAufrufe.length ? (
              <span className="text-xs text-[color:var(--muted)]" data-praesentation-aufrufe>
                Präsentation {a.praesAufrufe.length}× geöffnet
              </span>
            ) : null}
          </div>
        </div>

        {a.duplicates.length ? (
          <div data-funktion="contact-merge-duplicatehint--hinweis-moegliche-dubletten">
            <DuplicateHint contactId={c.id} contactName={name} duplicates={a.duplicates} />
          </div>
        ) : null}
        {a.referral ? (
          <div className="rounded-[var(--radius-lg)] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" data-kontakt-empfehlung data-funktion="page-referral--hinweis-empfehlung-von-kunde-mit-setup-rabatt">
            <span className="font-semibold">
              Empfehlung von{" "}
              <Link href={`/admin/kunden/${a.referral.referrer.id}`} className="underline">
                {a.referral.referrer.name}
              </Link>
            </span>{" "}
            am {fmtDate(a.referral.createdAt)}
            {a.referralDiscount?.eligible ? `, ${eur(a.referralDiscount.amount)} Setup-Rabatt` : ""}.
            {a.referralDiscount && !a.referralDiscount.eligible && a.referralDiscount.settingAmount != null ? (
              <span className="block text-xs text-amber-800">Kein automatischer Setup-Rabatt: {a.referralDiscount.reason}.</span>
            ) : null}
            {a.referralBenefit ? <span className="block">Neukunden-Vorteil fürs Angebot: {a.referralBenefit}</span> : null}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="min-w-0 space-y-5">
            {rechtsFaelle.length ? (
              <div data-funktion="datenschutz-recht--antwortvorlage-pruefen-und-senden">
                <DatenschutzRechtKarte contactId={c.id} faelle={rechtsFaelle} />
              </div>
            ) : null}
            <NaechsterSchritt c={c} a={a} termin={termin ?? null} />
            {/* Sprungmarke #aktivitaet öffnet „Eintragen“ (EintragenKnopf), #aufgaben springt zu den Aufgaben */}
            <Verlauf c={c} />
            {coldMailsOben ? <ColdMails c={c} /> : null}
          </div>

          <div className="min-w-0 space-y-5">
            {a.onboarding ? (
              <OnboardingCard
                onboarding={a.onboarding}
                items={onboardingChecklist(a.onboarding, a.obOffer)}
                customerName={a.onboarding.customer.name}
                loginEmail={a.onboarding.customer.users[0]?.email ?? null}
                feedback={feedback}
                websiteInfo={(a.onboarding.websiteInfo ?? null) as ImpressumInfo | null}
              />
            ) : a.acceptedOffer ? (
              <div data-funktion="onboarding-actions-startonboardingaction--onboarding-starten-neues-kundenkonto-oder">
                <StartOnboardingCard offerId={a.acceptedOffer.id} offerNumber={a.acceptedOffer.number} customers={a.freeCustomers} />
              </div>
            ) : null}

            {/* Angebotskarte nur mit Angebot; sonst eine Zeile „Erstellen“ (außer „Angebot“ ist schon die Hauptaktion) */}
            {c.offers.length ? (
              <div
                data-funktion={[
                  "deal-offers-card--angebotskarte-angebot-ansehen-und-pdf",
                  "offer-actions-sendofferemailaction--angebot-per-e-mail-senden-mit-anrede-rechner",
                  "offer-actions-markoffersentaction--angebot-als-verschickt-markieren-ohne-mail",
                  "offer-actions-deleteofferaction--angebot-loeschen",
                  "offer-actions-setpaymentreminderaction--zahlungserinnerung-spaeter-zahlen-erlauben",
                ].join(" ")}
              >
                <DealOffersCard
                  newOfferHref={`${pfad}/angebot`}
                  appUrl={a.appUrl}
                  offers={c.offers.map(toOfferRow)}
                  kontakt
                  kompakt
                  mail={{ audience: audienceForContact(c), pdf: { vertreter: a.pdfs.has("vertreter"), makler: a.pdfs.has("makler") }, link: true, entscheidung: a.entscheidungsHinweis }}
                  knopf={haupt?.art !== "angebot"}
                />
              </div>
            ) : haupt?.art !== "angebot" ? (
              <Card id="angebot">
                <CardHeader
                  title="Angebot"
                  hint="noch keins"
                  actions={
                    <ButtonLink href={`${pfad}/angebot`} icon={FilePlus2}>
                      Erstellen
                    </ButtonLink>
                  }
                />
              </Card>
            ) : null}

            <div
              data-funktion={[
                "followup-actions-approvefollowupaction--spaeter-follow-up-je-kontakt-freigeben-texte",
                "followup-actions-sendfollowupnowaction--spaeter-follow-up-mail-sofort-senden-texte-neu",
                "followup-actions-stopfollowupaction--spaeter-follow-up-stoppen-oder-planen",
              ].join(" ")}
            >
              {a.activeFollowup || c.followups.length || c.stage === "SPAETER" || c.emails.some((e) => e.sentiment === "SPAETER") ? (
                <FollowupCard contactId={c.id} followups={c.followups} plannable={!!a.threadMail} eaccount={a.followupMail?.eaccount ?? null} />
              ) : null}
            </div>

            <Card id="aufgaben">
              <CardHeader title="Aufgaben" count={aufgaben.length} />
              <div data-funktion="page-aufgaben--offene-aufgaben-des-kontakts-und-neue-aufgabe">
                {aufgaben.length ? (
                  <ul className="divide-y divide-[color:var(--border)]">
                    {aufgaben.map((t) => (
                      <TaskRow key={t.id} t={t} showContact={false} />
                    ))}
                  </ul>
                ) : null}
                <details className={aufgaben.length ? "border-t border-[color:var(--border)]" : undefined}>
                  <summary className="flex min-h-11 cursor-pointer list-none items-center px-5 text-sm font-medium text-[color:var(--brand)] [&::-webkit-details-marker]:hidden">+ Neue Aufgabe</summary>
                  <div className="px-5 pb-4">
                    <TaskForm contactId={c.id} compact />
                  </div>
                </details>
                {a.done.length ? (
                  <details className="border-t border-[color:var(--border)]">
                    <summary className="cursor-pointer px-5 py-2.5 text-sm text-[color:var(--muted)]">Erledigt ({a.done.length})</summary>
                    <ul className="divide-y divide-[color:var(--border)]">
                      {a.done.map((t) => (
                        <TaskRow key={t.id} t={t} showContact={false} />
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            </Card>

            <Daten c={c} a={a} coldMailsOben={coldMailsOben} />
          </div>
        </div>
      </div>
    </Seite>
  );
}

type Haupt = { art: "anrufen" | "mail" | "angebot" | "ergebnis"; label: string; href: string; icon: typeof Phone };

/**
 * Die EINE Hauptaktion im Kopf, nach Stufe (UX-Regel): Ergebnis fehlt nach einem Termin → „Ergebnis eintragen“;
 * Neu, Nicht erreicht, Wiedervorlage → „Anrufen“; Interesse/Termin ohne offenes Angebot → „Angebot“; Angebot offen →
 * „Nachfassen“ (anrufen, sonst Mail). Angenommen, Abschluss, Später, Verloren, Ungültig: keine (dann ist „Eintragen“ primär).
 */
function hauptaktion(x: { stage: string; tel: string | null; email: string | null; angebotOffen: boolean; nachfrage: boolean; angenommen: boolean; pfad: string }): Haupt | null {
  const anrufen = (label: string): Haupt | null =>
    x.tel ? { art: "anrufen", label, href: x.tel, icon: Phone } : x.email ? { art: "mail", label, href: `mailto:${x.email}`, icon: Mail } : null;
  if (x.nachfrage) return { art: "ergebnis", label: "Ergebnis eintragen", href: "#ergebnis", icon: ClipboardCheck };
  if (x.angenommen) return null;
  if (x.angebotOffen) return anrufen("Nachfassen");
  switch (x.stage) {
    case "NEU":
    case "NICHT_ERREICHT":
    case "WIEDERVORLAGE":
      return anrufen("Anrufen");
    case "INTERESSE":
    case "TERMIN":
      return { art: "angebot", label: "Angebot", href: `${x.pfad}/angebot`, icon: FilePlus2 };
    default:
      return null;
  }
}
