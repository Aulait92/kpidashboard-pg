"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, FileDown, FileText, Mail, Plus, Send } from "lucide-react";
import { Badge, Button, ButtonLink, Card, CardHeader } from "@/components/ui";
import { deleteOfferAction, markOfferSentAction, sendOfferEmailAction, setAbschlussBonusAction, setBankTransferAction, setPaymentReminderAction } from "@/app/admin/vertrieb/offer-actions";
import { ABSTAENDE_MIT_DATUM, ABSTAENDE_OHNE_DATUM, fmtTag } from "@/lib/angebot-zahlungserinnerung";
import { abrechnungsplan, abrechnungstagKurz } from "@/lib/abrechnungstag";
import { AngebotMehr } from "@/components/vertrieb/angebot-ablehnen";

export type DealOfferRow = {
  id: string;
  number: string;
  version: number;
  status: string;
  token: string;
  email: string | null;
  setupFee: number;
  monthlyFee: number;
  createdAt: string;
  sentAt: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  acceptedName: string | null;
  validUntil: string;
  paymentStatus: string;
  subscriptionStatus: string | null;
  isTest: boolean;
  /** YYYY-MM-DD */
  startDate: string | null;
  /** Ursprünglicher Start, falls nach dem Start gezahlt wurde (YYYY-MM-DD) */
  startShiftedFrom: string | null;
  /** Abrechnungstag (null = wie Start) und kostenloser Start bis dahin (lib/abrechnungstag.ts) */
  billingDay?: number | null;
  billingFreeStart?: boolean;
  /** Jahreszahlung angeboten (Kunde wählt) bzw. jährlich im Voraus (nach der Annahme: Wahl des Kunden) */
  annualChoice?: boolean;
  annualPrepay?: boolean;
  /** Laufzeit ("none" | "3m" | "6m" | "12m"): Vorauszahlung mit 6 Monaten = 6 Monate im Voraus */
  term?: string;
  /** „Ich zahle später“ auf der Angebotsseite erlaubt */
  allowPayLater: boolean;
  /** Überweisung nur auf Anfrage (lib/ueberweisung.ts): erlaubt, Zahlungsziel, gewählte Zahlweise, Funktion freigeschaltet */
  allowBankTransfer: boolean;
  bankTransferDays: number;
  zahlweise: string | null;
  ueberweisungVerfuegbar: boolean;
  mailDu: boolean;
  /** Zahlung erinnern am (YYYY-MM-DD), null = Standardplan */
  paymentReminderAt: string | null;
  paymentReminderCount: number;
  paymentReminderLastAt: string | null;
  /** Nächste geplante Erinnerung (YYYY-MM-DD), null = keine mehr */
  nextReminder: string | null;
  paymentSetUp: boolean;
  reminderBounds: { min: string; max: string | null } | null;
  /** Abschlussbonus netto (null = keiner), Frist (ISO) und ob er schon abgezogen wurde */
  abschlussBonus: number | null;
  abschlussBonusBis: string | null;
  abschlussBonusGewaehrt: number | null;
  abschlussBonusAbgelaufen: boolean;
  /** Später zahlen und rechtzeitig angenommen: Bonus gilt bei jeder späteren Zahlung */
  abschlussBonusGesichert: boolean;
  /** Als abgelehnt markiert (lib/vertrieb/angebot-ablehnen.ts): Zeitpunkt, Grund (Text), Notiz */
  declinedAt?: string | null;
  declineReason?: string | null;
  declineNote?: string | null;
  /** „Mehr“: Als abgelehnt markieren bzw. Wieder öffnen (solange gültig) */
  kannAblehnen?: boolean;
  kannWiederOeffnen?: boolean;
};

const PAYMENT: Record<string, { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }> = {
  pending: { label: "Zahlung offen", tone: "warning" },
  processing: { label: "Zahlung in Bestätigung", tone: "info" },
  paid: { label: "Bezahlt", tone: "success" },
  failed: { label: "Zahlung fehlgeschlagen", tone: "danger" },
};
const SUB: Record<string, string> = {
  active: "Abo aktiv",
  past_due: "Abo: Zahlung überfällig",
  unpaid: "Abo: unbezahlt",
  canceled: "Abo beendet",
  incomplete: "Abo: Zahlung ausstehend",
  paused: "Abo pausiert",
};

const STATUS: Record<string, { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }> = {
  draft: { label: "Entwurf", tone: "neutral" },
  sent: { label: "Verschickt", tone: "info" },
  accepted: { label: "Angenommen", tone: "success" },
  declined: { label: "Abgelehnt", tone: "danger" },
  superseded: { label: "Ersetzt", tone: "neutral" },
};

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

type Audience = "vertreter" | "makler";
/** Präsentationen (PDF) je Zielgruppe vorhanden? und Vorschlag aus dem Kontakt (Makler/Vertreter). */
export type OfferMailOptions = {
  audience: Audience;
  pdf: Record<Audience, boolean>;
  /** Vertriebskontakt: Link zur Web-Präsentation möglich */
  link?: boolean;
  /** Welche Variante zum Entscheidungs-Call die Mail enthält (gebucht: Termin, sonst Buchungslink), lib/vertrieb/entscheidungs-call.ts */
  entscheidung?: string | null;
};

export function DealOffersCard({
  newOfferHref,
  offers,
  appUrl,
  mail = { audience: "vertreter", pdf: { vertreter: false, makler: false } },
  knopf = true,
  kontakt = false,
}: {
  newOfferHref: string;
  offers: DealOfferRow[];
  appUrl: string;
  mail?: OfferMailOptions;
  /** false: kein „Angebot erstellen“ in der Karte (neuer Admin: steht schon als Hauptaktion im Kopf der Akte) */
  knopf?: boolean;
  /** Angebote eines Vertriebskontakts: Ablehnen fragt „Kontakt auch als verloren markieren?“ */
  kontakt?: boolean;
}) {
  const [mitRechner, setMitRechner] = useState(false);
  const [mitPraesentation, setMitPraesentation] = useState(false);
  const [mitLink, setMitLink] = useState(false);
  const [audience, setAudience] = useState<Audience>(mail.audience);
  const [du, setDu] = useState(false);
  const [ohneCall, setOhneCall] = useState(false);
  const pdfDa = mail.pdf[audience];
  const [msg, setMsg] = useState<string | null>(null);
  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 4000);
  };
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const current = offers.find((o) => o.status !== "superseded");
  const older = offers.filter((o) => o !== current);

  function run(id: string, fn: () => Promise<{ ok: boolean; error?: string; hinweis?: string }>, success: string) {
    setBusy(id);
    start(async () => {
      const res = await fn();
      setBusy(null);
      if (!res.ok) {
        alert(res.error ?? "Fehler");
        return;
      }
      flash(res.hinweis ? `${success}. ${res.hinweis}` : success);
      router.refresh();
    });
  }

  return (
    <div id="angebot">
      <Card>
        <CardHeader
          title="Angebot"
          icon={FileText}
          actions={knopf ? <ButtonLink href={newOfferHref} variant={current ? "secondary" : "primary"} icon={Plus}>{current ? "Neue Version" : "Angebot erstellen"}</ButtonLink> : <span />}
        />
        {!current ? (
          <p className="px-5 py-4 text-sm text-[color:var(--muted)]">Noch kein Angebot. Erstelle es direkt im Gespräch. Der Interessent kann es online annehmen.</p>
        ) : (
          <div className="space-y-3 px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{current.number}</span>
              {current.version > 1 ? <span className="text-xs text-[color:var(--muted)]">Version {current.version}</span> : null}
              <Badge tone={STATUS[current.status]?.tone ?? "neutral"}>{STATUS[current.status]?.label ?? current.status}</Badge>
              {current.zahlweise === "ueberweisung" && current.paymentStatus === "processing" ? (
                <Badge tone="info">Rechnung offen (Überweisung)</Badge>
              ) : PAYMENT[current.paymentStatus] ? (
                <Badge tone={PAYMENT[current.paymentStatus].tone}>{PAYMENT[current.paymentStatus].label}</Badge>
              ) : null}
              {current.subscriptionStatus ? <Badge tone={current.subscriptionStatus === "active" ? "success" : "warning"}>{SUB[current.subscriptionStatus] ?? `Abo: ${current.subscriptionStatus}`}</Badge> : null}
            </div>
            <div className="text-sm text-[color:var(--muted)]">
              {eur(current.setupFee)} Setup · {eur(current.monthlyFee)} / Monat (netto) · gültig bis {fmt(current.validUntil).split(",")[0]}
            </div>
            <ul className="space-y-0.5 text-xs text-[color:var(--muted)]">
              <li>Erstellt {fmt(current.createdAt)}</li>
              {current.sentAt ? <li>Verschickt {fmt(current.sentAt)}</li> : null}
              {current.viewedAt ? <li>Vom Interessenten geöffnet {fmt(current.viewedAt)}</li> : null}
              {current.acceptedAt ? <li className={current.status === "declined" ? "" : "font-medium text-emerald-700"}>Angenommen {fmt(current.acceptedAt)} von {current.acceptedName}</li> : null}
              {current.status === "declined" ? (
                <li className="font-medium text-rose-700" data-angebot-abgelehnt>
                  Abgelehnt{current.declinedAt ? ` ${fmt(current.declinedAt)}` : ""}: {current.declineReason ?? "Sonstiges"}
                  {current.declineNote ? <span className="block font-normal text-[color:var(--muted)]">{current.declineNote}</span> : null}
                </li>
              ) : null}
              {current.billingDay != null ? (
                <li data-angebot-abrechnungstag>
                  Abrechnung {abrechnungstagKurz(abrechnungsplan({ startIso: current.startDate, billingDay: current.billingDay, freeStart: current.billingFreeStart }))}
                </li>
              ) : null}
              {current.annualChoice || current.annualPrepay ? (
                <li data-angebot-zahlweise>
                  {current.status === "accepted"
                    ? `Zahlweise: ${current.annualPrepay ? (current.term === "6m" ? "6 Monate im Voraus" : "jährlich im Voraus") : "monatlich"}${current.annualChoice ? " (vom Kunden gewählt)" : ""}`
                    : current.annualChoice
                      ? "Vorauszahlung angeboten, Kunde wählt bei der Annahme (monatlich vorausgewählt)"
                      : "Zahlweise: jährlich im Voraus"}
                </li>
              ) : null}
              {current.startShiftedFrom && current.startDate ? (
                <li className="font-medium text-amber-700" data-start-verschoben>
                  Start verschoben: {fmtTag(current.startShiftedFrom)} → {fmtTag(current.startDate)} (erst nach dem Start gezahlt, Kunde per Mail informiert)
                </li>
              ) : null}
            </ul>
            {current.abschlussBonus && current.status !== "declined" ? <AbschlussBonusFrist offer={current} onDone={(m) => { flash(m); router.refresh(); }} /> : null}
            {current.status === "accepted" && !current.isTest && !current.paymentSetUp ? (
              <PaymentReminder offer={current} onDone={(m) => { flash(m); router.refresh(); }} />
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                icon={Copy}
                onClick={() => {
                  navigator.clipboard.writeText(`${appUrl}/angebot/${current.token}`);
                  flash("Link kopiert");
                }}
              >
                Link kopieren
              </Button>
              <ButtonLink href={`/angebot/${current.token}`} external icon={ExternalLink}>Ansehen</ButtonLink>
              <ButtonLink href={`/angebot/${current.token}/pdf`} external icon={FileDown}>PDF</ButtonLink>
              {current.status === "draft" || current.status === "sent" ? (
                <>
                  <Button
                    icon={Mail}
                    disabled={pending || !current.email}
                    title={current.email ? `An ${current.email}` : "Keine E-Mail im Angebot"}
                    onClick={() =>
                      run(
                        current.id,
                        () => sendOfferEmailAction(current.id, { rechner: mitRechner, praesentation: mitPraesentation && pdfDa, praesentationLink: !!mail.link && mitLink, audience, du, ohneEntscheidungsCall: !!mail.entscheidung && ohneCall }),
                        `Angebot an ${current.email} gesendet`,
                      )
                    }
                  >
                    {busy === current.id ? "Sende …" : "Per E-Mail senden"}
                  </Button>
                  {current.status === "draft" ? (
                    <Button icon={Send} variant="ghost" disabled={pending} onClick={() => run(current.id, () => markOfferSentAction(current.id), "Als verschickt markiert")}>
                      Als verschickt markieren
                    </Button>
                  ) : null}
                </>
              ) : null}
              {/* Seltenes unter „Mehr“: Als abgelehnt markieren, Wieder öffnen, Löschen */}
              <AngebotMehr
                offer={{ id: current.id, number: current.number, kannAblehnen: !!current.kannAblehnen, kannWiederOeffnen: !!current.kannWiederOeffnen, kontakt: kontakt }}
                onDone={flash}
                loeschen={
                  current.status !== "accepted" && !current.acceptedAt && (!current.paymentStatus || current.paymentStatus === "none")
                    ? () => {
                        if (!confirm(`Angebot ${current.number} wirklich löschen? Der Link funktioniert danach nicht mehr.`)) return;
                        run(current.id, () => deleteOfferAction(current.id), "Angebot gelöscht");
                      }
                    : undefined
                }
              />
            </div>
            {current.status === "draft" || current.status === "sent" ? (
              <div className="space-y-2 rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-3 py-2.5 text-sm" data-mail-extras>
                <div className="flex items-center gap-2" data-anrede>
                  <span className="text-xs font-medium text-[color:var(--muted)]">Anrede</span>
                  <div className="inline-flex rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white p-0.5">
                    {([false, true] as const).map((v) => (
                      <button
                        key={String(v)}
                        type="button"
                        onClick={() => setDu(v)}
                        aria-pressed={du === v}
                        className={`rounded-[6px] px-2.5 py-0.5 text-xs font-medium ${du === v ? "bg-[color:var(--brand)] text-white" : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"}`}
                      >
                        {v ? "Du" : "Sie"}
                      </button>
                    ))}
                  </div>
                </div>
                {mail.entscheidung ? (
                  <div className="space-y-1" data-entscheidungs-call>
                    {!ohneCall ? <p className="text-xs text-[color:var(--muted)]">{mail.entscheidung}</p> : null}
                    <label className="flex items-center gap-2" data-ohne-entscheidungs-call>
                      <input type="checkbox" className="h-4 w-4" checked={ohneCall} onChange={(e) => setOhneCall(e.target.checked)} />
                      Ohne Bitte um den Entscheidungs-Call
                    </label>
                  </div>
                ) : null}
                <div className="text-xs font-medium text-[color:var(--muted)]">Mit der E-Mail mitschicken</div>
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="h-4 w-4" checked={mitRechner} onChange={(e) => setMitRechner(e.target.checked)} />
                  Rechner-Link
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <label className={`flex items-center gap-2 ${pdfDa ? "" : "opacity-60"}`}>
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      disabled={!pdfDa}
                      checked={mitPraesentation && pdfDa}
                      onChange={(e) => setMitPraesentation(e.target.checked)}
                    />
                    Präsentation als PDF
                  </label>
                  <select
                    aria-label="Präsentation für"
                    value={audience}
                    onChange={(e) => setAudience(e.target.value as Audience)}
                    className="h-8 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm"
                  >
                    <option value="vertreter">Vertreter</option>
                    <option value="makler">Makler</option>
                  </select>
                  {!pdfDa ? (
                    <Link href="/admin/marketing/unterlagen" className="text-xs text-[color:var(--brand)] underline">
                      PDF unter Unterlagen hochladen
                    </Link>
                  ) : null}
                </div>
                {mail.link ? (
                  <label className="flex items-center gap-2" data-praesentation-link>
                    <input type="checkbox" className="h-4 w-4" checked={mitLink} onChange={(e) => setMitLink(e.target.checked)} />
                    Link zur Präsentation zum Durchklicken (14 Tage, mit den Preisen aus dem Angebot)
                  </label>
                ) : null}
                <p className="text-xs text-[color:var(--muted)]">Der Rechner öffnet sich mit Budget aus dem Angebot und der gewählten Zielgruppe.</p>
                {!current.isTest ? <PayLaterToggle offer={current} onDone={(m) => { flash(m); router.refresh(); }} /> : null}
                {!current.isTest ? <BankTransferToggle offer={current} onDone={(m) => { flash(m); router.refresh(); }} /> : null}
              </div>
            ) : null}
            {msg ? <p className="text-xs font-medium text-emerald-700">{msg}</p> : null}
          </div>
        )}
        {older.length ? (
          <div className="border-t border-[color:var(--border)] px-5 py-3 text-xs text-[color:var(--muted)]">
            Frühere Versionen:{" "}
            {older.map((o, i) => (
              <span key={o.id}>
                {i ? ", " : ""}
                <Link href={`/angebot/${o.token}`} target="_blank" className="underline">{o.number}</Link>
              </span>
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  );
}

const berlinTag = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date(iso));

/** Abschlussbonus: Frist ansehen und verschieben (Ole, 16.11.2026: „abends setze ich die Frist auf den Folgetag“). */
function AbschlussBonusFrist({ offer, onDone }: { offer: DealOfferRow; onDone: (msg: string) => void }) {
  const tag = offer.abschlussBonusBis ? berlinTag(offer.abschlussBonusBis) : "";
  const [date, setDate] = useState(tag);
  const [pending, start] = useTransition();
  const betrag = eur(offer.abschlussBonus ?? 0);
  if (offer.abschlussBonusGewaehrt != null) {
    return <p className="text-xs font-medium text-emerald-700" data-abschlussbonus>Abschlussbonus {eur(offer.abschlussBonusGewaehrt)} genutzt</p>;
  }
  if (offer.abschlussBonusGesichert) {
    return <p className="text-xs font-medium text-emerald-700" data-abschlussbonus>Abschlussbonus {eur(offer.abschlussBonus ?? 0)} gesichert (rechtzeitig angenommen, Zahlung folgt)</p>;
  }
  const offen = offer.status === "draft" || offer.status === "sent" || (offer.status === "accepted" && !offer.paymentSetUp);
  const abgelaufen = offer.abschlussBonusAbgelaufen;
  if (!offen) return null;
  return (
    <form
      className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-3 py-2 text-sm"
      data-abschlussbonus
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await setAbschlussBonusAction(offer.id, { bis: date });
          if (!res.ok) alert(res.error);
          else onDone(`Abschlussbonus gilt bis ${fmtTag(date)}, 23:59 Uhr`);
        });
      }}
    >
      <label htmlFor={`bonus-${offer.id}`} className="text-xs font-medium text-[color:var(--muted)]">
        Abschlussbonus {betrag} {abgelaufen ? "(abgelaufen) " : ""}gilt bis
      </label>
      <input
        id={`bonus-${offer.id}`}
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="h-8 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm"
      />
      <span className="text-xs text-[color:var(--muted)]">23:59 Uhr</span>
      <Button type="submit" variant="secondary" disabled={pending || !date || date === tag}>
        Speichern
      </Button>
    </form>
  );
}

/** „Später zahlen erlauben“: zeigt auf der Angebotsseite nach der Annahme „Ich zahle später, erinnern Sie mich am …“. */
function PayLaterToggle({ offer, onDone }: { offer: DealOfferRow; onDone: (msg: string) => void }) {
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 border-t border-[color:var(--border)] pt-2" data-pay-later-toggle>
      <input
        type="checkbox"
        className="h-4 w-4"
        disabled={pending}
        checked={offer.allowPayLater}
        onChange={(e) => {
          const allow = e.target.checked;
          start(async () => {
            const res = await setPaymentReminderAction(offer.id, { allowPayLater: allow });
            if (!res.ok) alert(res.error);
            else onDone(allow ? "Später zahlen erlaubt" : "Später zahlen nicht mehr erlaubt");
          });
        }}
      />
      Später zahlen erlauben (Kunde wählt den Tag der Zahlungserinnerung)
    </label>
  );
}

/** „Überweisung erlauben“ (nur auf Anfrage, Ole 17.11.2026): Option „Per Überweisung zahlen“ auf der Angebotsseite. */
function BankTransferToggle({ offer, onDone }: { offer: DealOfferRow; onDone: (msg: string) => void }) {
  const [pending, start] = useTransition();
  const [days, setDays] = useState(String(offer.bankTransferDays));
  if (!offer.ueberweisungVerfuegbar) return null;
  if (offer.zahlweise === "ueberweisung") {
    return (
      <p className="border-t border-[color:var(--border)] pt-2 text-xs" data-ueberweisung-gewaehlt>
        Zahlt per Überweisung (Rechnung, Zahlungsziel {offer.bankTransferDays} Tage)
      </p>
    );
  }
  const save = (allow: boolean, d: string) =>
    start(async () => {
      const res = await setBankTransferAction(offer.id, { allow, days: d });
      if (!res.ok) alert(res.error);
      else onDone(allow ? `Überweisung erlaubt (${d} Tage)` : "Überweisung nicht mehr erlaubt");
    });
  return (
    <label className="flex flex-wrap items-center gap-2 border-t border-[color:var(--border)] pt-2" data-ueberweisung-toggle>
      <input type="checkbox" className="h-4 w-4" disabled={pending || offer.paymentSetUp} checked={offer.allowBankTransfer} onChange={(e) => save(e.target.checked, days)} />
      Überweisung erlauben, nur auf Anfrage, Zahlungsziel
      <input
        aria-label="Zahlungsziel in Tagen"
        inputMode="numeric"
        value={days}
        disabled={pending || offer.paymentSetUp}
        onChange={(e) => setDays(e.target.value)}
        onBlur={() => offer.allowBankTransfer && days !== String(offer.bankTransferDays) && save(true, days)}
        className="h-7 w-12 rounded border border-[color:var(--border)] px-1.5 text-right text-xs"
      />
      Tage
    </label>
  );
}

/** Angenommen, Zahlung offen: „Zahlung erinnern am“, Anrede der Erinnerung, Stand des Plans (Ole, 16.11.2026). */
function PaymentReminder({ offer, onDone }: { offer: DealOfferRow; onDone: (msg: string) => void }) {
  const [date, setDate] = useState(offer.paymentReminderAt ?? "");
  const [pending, start] = useTransition();
  const save = (input: Parameters<typeof setPaymentReminderAction>[1], msg: string) =>
    start(async () => {
      const res = await setPaymentReminderAction(offer.id, input);
      if (!res.ok) alert(res.error);
      else onDone(msg);
    });
  const max = offer.paymentReminderAt ? ABSTAENDE_MIT_DATUM.length : ABSTAENDE_OHNE_DATUM.length;
  const stand = offer.nextReminder
    ? `Nächste Erinnerung ${fmtTag(offer.nextReminder)} · ${offer.paymentReminderCount} von ${max} gesendet`
    : `${offer.paymentReminderCount} von ${max} Erinnerungen gesendet, keine weitere geplant`;
  return (
    <div className="space-y-2 rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-3 py-2.5 text-sm" data-zahlung-erinnern>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save({ date: date || null }, date ? `Erinnerung am ${fmtTag(date)}` : "Standardplan ohne Datum");
        }}
      >
        <label htmlFor={`erinnern-${offer.id}`} className="text-xs font-medium text-[color:var(--muted)]">
          Zahlung erinnern am
        </label>
        <input
          id={`erinnern-${offer.id}`}
          type="date"
          value={date}
          min={offer.reminderBounds?.min}
          max={offer.reminderBounds?.max ?? undefined}
          onChange={(e) => setDate(e.target.value)}
          className="h-8 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm"
        />
        <Button type="submit" variant="secondary" disabled={pending || date === (offer.paymentReminderAt ?? "")}>
          Speichern
        </Button>
        {offer.paymentReminderAt ? (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => { setDate(""); save({ date: null }, "Standardplan ohne Datum"); }}>
            Datum entfernen
          </Button>
        ) : null}
      </form>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs text-[color:var(--muted)]" data-zahlung-stand>{stand}</span>
        <div className="inline-flex rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white p-0.5" aria-label="Anrede der Erinnerung">
          {([false, true] as const).map((v) => (
            <button
              key={String(v)}
              type="button"
              disabled={pending}
              onClick={() => v !== offer.mailDu && save({ du: v }, `Anrede: ${v ? "Du" : "Sie"}`)}
              aria-pressed={offer.mailDu === v}
              className={`rounded-[6px] px-2.5 py-0.5 text-xs font-medium ${offer.mailDu === v ? "bg-[color:var(--brand)] text-white" : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"}`}
            >
              {v ? "Du" : "Sie"}
            </button>
          ))}
        </div>
      </div>
      <PayLaterToggle offer={offer} onDone={onDone} />
      <BankTransferToggle offer={offer} onDone={onDone} />
    </div>
  );
}
