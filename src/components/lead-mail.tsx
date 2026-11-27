"use client";

// E-Mail an den Lead (Ole, 13.11.2026): Vorlage wählen, anpassen, Dokumente (z. B. Angebot) anhängen, senden.
// Danach im Verlauf. Seit 17.11.2026 (Pakete M0/M1): Versand über den Lead-Mail-Baustein, also aus dem eigenen
// Postfach oder ohne Postfach von unserer Versanddomain mit „Name | Agentur“, Antwort an Sie, Signatur und Kopie;
// dazu „Im eigenen Mailprogramm öffnen“ und „Text kopieren“ mit „Gesendet?“ (components/mail-wege.tsx). Bei
// „E-Mail-Funktionen aus“ nur diese beiden.
// Seit 14.11.2026: Vorlagen nach Phase des Kontakts sortiert (passende vorn, übrige unter „Weitere“),
// Felder für Zusatz-Platzhalter (Termin, fehlende Unterlagen, Musterkündigung, Zusammenfassung, Datum)
// und die passende Nachfass-Aufgabe nach dem Senden.

import { useEffect, useEffectEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, Info, Paperclip, Pencil, Sparkles } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { MailWege } from "@/components/mail-wege";
import { mailSelbstGesendetAction, sendLeadMailAction, type MailPdf } from "@/app/buyer/postfach/actions";
import {
  datumKurz,
  fehlendeUnterlagen,
  fuelle,
  fuelleMitSignatur,
  hatTerminlink,
  musterKuendigung,
  tagText,
  terminArtText,
  terminDatumText,
  terminUnterlagen,
  UNTERLAGEN_OPTIONEN,
  werteFuer,
  zusatzIn,
  type Werte,
} from "@/lib/mail/platzhalter";
import { nachfassenFuer, sortiereVorlagen } from "@/lib/mail/phasen";
import { fromDayKey } from "@/lib/vertrieb/dates";
import type { Ansprache } from "@/lib/ansprache";
import { cn } from "@/lib/utils";

export const LEAD_MAIL_EVENT = "pg-lead-mail-open";

/**
 * Dialog öffnen, optional gleich mit einer Standardvorlage (z. B. „willkommen“ aus der Aufgabe „Police da?“) und
 * vorausgefüllten Feldern (z. B. Versicherer für die Kündigung, Paket M6). Mit leadId öffnet nur das Fenster dieses
 * Kontakts (27.11.2026: sind zwei Kontakte gleichzeitig geladen, etwa Heute mit Kontakt rechts und darüber ein zweiter
 * als Fenster, öffneten sonst beide Mail-Fenster; Gefahr einer Mail an den falschen Empfänger).
 */
export function oeffneLeadMail(vorlage?: string, felder?: { versicherer?: string }, leadId?: string) {
  window.dispatchEvent(new CustomEvent(LEAD_MAIL_EVENT, { detail: vorlage || leadId ? { vorlage, felder, leadId } : undefined }));
}

/** Gilt das Öffnen-Ereignis für das Mail-Fenster dieses Kontakts? Ohne leadId im Ereignis: ja (ältere Aufrufer). Rein. */
export function mailEreignisFuer(detail: { leadId?: string } | null | undefined, leadId: string): boolean {
  return !detail?.leadId || detail.leadId === leadId;
}

type Vorlage = { id: string; name: string; subject: string; body: string; standardKey?: string | null };
type Datei = { id: string; fileName: string; kind: string };

type Felder = {
  terminTag: string;
  terminZeit: string;
  terminArt: "phone" | "video";
  videolink: string;
  unterlagen: string[];
  unterlagenExtra: string;
  meldeTag: string;
  versicherer: string;
  vertragsnummer: string;
  kuendigungTag: string;
  wuensche: string;
  rat: string;
  /** Angebot: drei Vorteile in Stichworten (Ole, 15.11.2026) */
  vorteile: [string, string, string];
};

const input =
  "w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-[15px] outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20";
const label = "mb-1 block text-xs font-medium text-[color:var(--muted)]";

const berlinTag = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d);
const berlinZeit = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(d);
const inTagen = (n: number) => berlinTag(new Date(Date.now() + n * 86_400_000));
/** In einer Woche, am Wochenende auf den folgenden Montag (Vorschlag für „Wie besprochen“). */
const inEinerWoche = () => {
  const tag = inTagen(7);
  const wd = new Date(`${tag}T12:00:00Z`).getUTCDay();
  return wd === 6 ? inTagen(9) : wd === 0 ? inTagen(8) : tag;
};

export function LeadMailComposer({
  leadId,
  lead,
  to: initialTo,
  from,
  meinname,
  signatur = "",
  ansprache = "sie",
  terminlink = null,
  vorlagen,
  dateien,
  empfohlen = [],
  termin = null,
  beratung = { wuensche: "", notizen: [] },
  appVersand = true,
  bereitlegen = [],
}: {
  leadId: string;
  lead: { name: string | null; source: string | null; salutation?: string | null; firstName?: string | null; lastName?: string | null };
  to: string | null;
  /** Zeile unter dem Titel, z. B. „Von Ole Kannapinn | Agentur“ */
  from: string;
  meinname: string;
  /** E-Mail-Signatur (Postfach-Einstellungen); steht unter jeder E-Mail */
  signatur?: string;
  /** Ansprache des Kunden (Sie/Du) für {anrede} */
  ansprache?: Ansprache;
  /** Persönlicher Buchungslink für diesen Lead (null = schon ein Termin oder kein Kalender) */
  terminlink?: string | null;
  vorlagen: Vorlage[];
  dateien: Datei[];
  /** Passende Standardvorlagen zur Phase (lib/mail/phasen.ts), in Reihenfolge */
  empfohlen?: string[];
  /** Nächster Termin für {termin_datum}, {termin_art}, {videolink} */
  termin?: { startsAt: string; mode: string; meetUrl: string | null } | null;
  /** Vorschlag für die Gesprächszusammenfassung und die letzten Notizen */
  beratung?: { wuensche: string; notizen: string[] };
  /** Über die App senden möglich (Postfach oder Versanddomain); false bei „E-Mail-Funktionen aus“ */
  appVersand?: boolean;
  /** Bereitlegen-Liste zum Termin (bereitlegenFuerLead, dieselbe wie in WhatsApp und Termin-Mails) für {termin_unterlagen} */
  bereitlegen?: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [vorlage, setVorlage] = useState<Vorlage | null>(null);
  const [to, setTo] = useState(initialTo ?? "");
  const [subject, setSubject] = useState("");
  // Ohne Vorlage: Signatur schon unten im Text, darüber Platz zum Schreiben
  const leer = signatur.trim() ? `\n\n${signatur.trim()}` : "";
  const [text, setText] = useState(leer);
  const [files, setFiles] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  // Text von Hand geändert: Felder überschreiben ihn nicht mehr automatisch
  const [dirty, setDirty] = useState(false);
  const [veraltet, setVeraltet] = useState(false);
  const [weitereOffen, setWeitereOffen] = useState(false);
  const [pdf, setPdf] = useState(false);
  const [felder, setFelder] = useState<Felder>(() => ({
    terminTag: "",
    terminZeit: "",
    terminArt: "phone",
    videolink: "",
    unterlagen: [],
    unterlagenExtra: "",
    meldeTag: "",
    versicherer: "",
    vertragsnummer: "",
    kuendigungTag: "",
    wuensche: beratung.wuensche,
    rat: "",
    vorteile: ["", "", ""],
  }));
  // Erinnern, falls kein Termin gebucht wird (bzw. Nachfass-Aufgabe der Vorlage)
  const [remind, setRemind] = useState(true);
  const [remindDays, setRemindDays] = useState(2);
  const mitLink = hatTerminlink(text, terminlink);
  const key = vorlage?.standardKey ?? null;
  const zusatz = useMemo(() => (vorlage ? zusatzIn(vorlage.subject, vorlage.body) : new Set<string>()), [vorlage]);
  const hatTermin = zusatz.has("termin_datum") || zusatz.has("termin_art") || zusatz.has("videolink");
  const hatUnterlagen = zusatz.has("fehlende_unterlagen");
  const hatMelde = zusatz.has("melde_datum") || zusatz.has("melde_wann");
  const hatKuendigung = zusatz.has("musterkuendigung") || zusatz.has("versicherer") || zusatz.has("vertragsnummer") || zusatz.has("kuendigungstermin");
  const hatBeratung = zusatz.has("wuensche") || zusatz.has("rat");
  const hatVorteile = zusatz.has("vorteil_1") || zusatz.has("vorteil_2") || zusatz.has("vorteil_3");
  const { passend, weitere } = useMemo(() => sortiereVorlagen(vorlagen, empfohlen), [vorlagen, empfohlen]);

  const werte = (f: Felder): Werte => {
    const base = { ...werteFuer(lead, meinname, { ansprache, terminlink }), signatur };
    const kTermin = datumKurz(f.kuendigungTag);
    const start = f.terminTag ? fromDayKey(f.terminTag, f.terminZeit || "09:00") : null;
    return {
      ...base,
      termin_datum: start && !Number.isNaN(start.getTime()) ? terminDatumText(start) : "",
      termin_art: terminArtText(f.terminArt),
      videolink: f.terminArt === "video" ? f.videolink : "",
      termin_unterlagen: terminUnterlagen(bereitlegen),
      fehlende_unterlagen: fehlendeUnterlagen([...f.unterlagen, f.unterlagenExtra]),
      melde_datum: f.meldeTag ? tagText(f.meldeTag) : "",
      melde_wann: f.meldeTag ? `am ${tagText(f.meldeTag)}` : "",
      versicherer: f.versicherer,
      vertragsnummer: f.vertragsnummer,
      kuendigungstermin: kTermin,
      musterkuendigung: musterKuendigung({ name: base.name, versicherer: f.versicherer, vertragsnummer: f.vertragsnummer, kuendigungstermin: kTermin }),
      wuensche: f.wuensche,
      rat: f.rat,
      vorteil_1: f.vorteile[0],
      vorteil_2: f.vorteile[1],
      vorteil_3: f.vorteile[2],
    };
  };

  const fill = (v: Vorlage, f: Felder) => {
    const w = werte(f);
    setSubject(fuelle(v.subject, w));
    setText(fuelleMitSignatur(v.body, w));
    setDirty(false);
    setVeraltet(false);
  };

  const pick = (v: Vorlage, vorgabe?: { versicherer?: string }) => {
    // Feste Werte beim Wählen: nächster Termin, Datum „in einer Woche“ für „Wie besprochen“
    const t = termin ? new Date(termin.startsAt) : null;
    const f: Felder = {
      ...felder,
      ...(vorgabe?.versicherer && !felder.versicherer ? { versicherer: vorgabe.versicherer } : {}),
      terminTag: felder.terminTag || (t ? berlinTag(t) : ""),
      terminZeit: felder.terminZeit || (t ? berlinZeit(t) : ""),
      terminArt: felder.terminTag ? felder.terminArt : termin?.mode === "video" ? "video" : "phone",
      videolink: felder.videolink || termin?.meetUrl || "",
      meldeTag: felder.meldeTag || inEinerWoche(),
    };
    setFelder(f);
    setVorlage(v);
    fill(v, f);
    const z = zusatzIn(v.subject, v.body);
    // Kündigung aus der Aufgabe „Alten Vertrag kündigen“ (Paket M6): Musterkündigung gleich als PDF
    setPdf(z.has("wuensche") || z.has("rat") || (!!vorgabe && z.has("musterkuendigung")));
    setRemind(true);
    // Angebot-Vorlage: vorhandenes Angebot gleich anhängen; Willkommen: die Police
    const kind = /angebot/i.test(v.name) ? "angebot" : v.standardKey === "willkommen" ? "police" : null;
    const datei = kind ? dateien.find((d) => d.kind === kind) : null;
    if (datei) setFiles((s) => new Set(s).add(datei.id));
  };

  const setF = (patch: Partial<Felder>) => {
    const next = { ...felder, ...patch };
    setFelder(next);
    if (!vorlage) return;
    if (dirty) setVeraltet(true);
    else fill(vorlage, next);
  };

  // Geöffnet, ggf. mit Wunschvorlage (z. B. Willkommen nach „Police erledigt“)
  const onOpen = useEffectEvent((e: Event) => {
    const detail = (e as CustomEvent<{ vorlage?: string; felder?: { versicherer?: string }; leadId?: string } | undefined>).detail;
    // Nur das Fenster des gemeinten Kontakts öffnen (nie das eines anderen, gleichzeitig geladenen Kontakts)
    if (!mailEreignisFuer(detail, leadId)) return;
    setOpen(true);
    const wunsch = detail?.vorlage;
    const v = wunsch ? vorlagen.find((x) => x.standardKey === wunsch) : null;
    if (v) pick(v, detail?.felder ?? {});
  });
  useEffect(() => {
    const handler = (e: Event) => onOpen(e);
    window.addEventListener(LEAD_MAIL_EVENT, handler);
    return () => window.removeEventListener(LEAD_MAIL_EVENT, handler);
  }, []);

  const fehlt = hatUnterlagen && !felder.unterlagen.length && !felder.unterlagenExtra.trim()
    ? "Bitte mindestens eine fehlende Angabe auswählen."
    : hatBeratung && (!felder.wuensche.trim() || !felder.rat.trim())
      ? "Bitte Wünsche sowie Rat und Gründe ausfüllen."
      : hatMelde && !felder.meldeTag
        ? "Bitte das Datum wählen."
        : hatVorteile && felder.vorteile.some((v) => !v.trim())
          ? "Bitte drei Vorteile des Angebots eintragen."
          : null;

  const send = () =>
    start(async () => {
      let mailPdf: MailPdf | null = null;
      if (pdf && hatBeratung) mailPdf = { art: "beratung", wuensche: felder.wuensche, rat: felder.rat };
      else if (pdf && hatKuendigung) mailPdf = { art: "kuendigung", versicherer: felder.versicherer, vertragsnummer: felder.vertragsnummer, kuendigungstermin: felder.kuendigungTag };
      const res = await sendLeadMailAction({
        leadId,
        to,
        subject,
        text,
        fileIds: [...files],
        vorlageKey: key,
        erinnern: remind,
        erinnernTage: remindDays,
        mitLink,
        meldeTag: hatMelde ? felder.meldeTag : null,
        fehlende: hatUnterlagen ? fehlendeUnterlagen([...felder.unterlagen, felder.unterlagenExtra]) : null,
        pdf: mailPdf,
      });
      if (!res.ok) return toast.show({ message: res.error, tone: "error" });
      toast.show({ message: res.reminder ? `E-Mail gesendet. ${res.reminder}` : `E-Mail an ${to} gesendet` });
      fertig();
    });

  // Nach dem Senden (App oder eigenes Mailprogramm): schließen, leeren, nach dem nächsten Schritt fragen
  const fertig = () => {
    setOpen(false);
    setVorlage(null);
    setSubject("");
    setText(leer);
    setFiles(new Set());
    setDirty(false);
    setVeraltet(false);
    router.refresh();
    // Nächster Schritt: fragen, wie es weitergeht (components/next-step.tsx)
    window.dispatchEvent(new CustomEvent("pg-lead-action", { detail: { leadId } }));
  };

  // „Gesendet?“ → Ja: Eintrag im Verlauf (eigenes Mailprogramm) und dieselben Folgen wie beim Senden
  const selbstGesendet = async () => {
    const res = await mailSelbstGesendetAction({
      leadId,
      to,
      subject,
      text,
      vorlageKey: key,
      erinnern: remind,
      erinnernTage: remindDays,
      mitLink,
      meldeTag: hatMelde ? felder.meldeTag : null,
      fehlende: hatUnterlagen ? fehlendeUnterlagen([...felder.unterlagen, felder.unterlagenExtra]) : null,
    });
    if (!res.ok) return toast.show({ message: res.error, tone: "error" });
    toast.show({ message: res.reminder ? `Im Verlauf eingetragen. ${res.reminder}` : "Im Verlauf eingetragen" });
    fertig();
  };

  const chip = (v: Vorlage, hervor: boolean) => (
    <button
      key={v.id}
      type="button"
      onClick={() => pick(v)}
      data-vorlage={v.standardKey ?? "eigen"}
      data-passend={hervor ? "" : undefined}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm",
        vorlage?.id === v.id
          ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)] font-semibold text-[color:var(--brand)]"
          : hervor
            ? "border-[color:var(--brand)]/50 bg-[color:var(--brand-soft)]/40 font-medium"
            : "border-[color:var(--border)]",
      )}
    >
      {hervor ? <Sparkles className="h-3.5 w-3.5 text-[color:var(--brand)]" /> : null}
      {v.name}
    </button>
  );

  const nachfassen = nachfassenFuer(key, { erinnern: true, tage: remindDays, mitLink, meldeTag: hatMelde ? felder.meldeTag || "x" : null });

  return (
    <Sheet open={open} onClose={() => setOpen(false)} title="E-Mail schreiben" message={from}>
      <div className="max-h-[calc(100dvh-10rem)] space-y-3 overflow-y-auto p-5" data-lead-mail>
        {vorlagen.length ? (
          <div className="space-y-2" data-mail-vorlagen>
            {passend.length ? (
              <>
                <p className="text-xs font-medium text-[color:var(--muted)]">Passt gerade zu diesem Kontakt</p>
                <div className="flex flex-wrap gap-1.5" data-vorlagen-passend>
                  {passend.map((v) => chip(v, true))}
                </div>
                {weitere.length ? (
                  <button
                    type="button"
                    onClick={() => setWeitereOffen((x) => !x)}
                    aria-expanded={weitereOffen}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
                    data-vorlagen-weitere-toggle
                  >
                    Weitere ({weitere.length}) <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", weitereOffen && "rotate-180")} />
                  </button>
                ) : null}
              </>
            ) : null}
            {!passend.length || weitereOffen ? (
              <div className="flex flex-wrap gap-1.5" data-vorlagen-weitere>
                {weitere.map((v) => chip(v, false))}
              </div>
            ) : null}
          </div>
        ) : null}
        {/* Vorlagen/Signatur ändern direkt aus dem Fenster (Ole, 14.11.2026) */}
        <Link href="/buyer/postfach#vorlagen" className="inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--brand)] hover:underline" data-mail-edit-templates>
          <Pencil className="h-3.5 w-3.5" /> Vorlagen & Signatur bearbeiten
        </Link>
        <input value={to} onChange={(e) => setTo(e.target.value)} type="email" placeholder="An" aria-label="An" className={`${input} h-11`} />

        {hatTermin || hatUnterlagen || hatMelde || hatKuendigung || hatBeratung || hatVorteile ? (
          <div className="space-y-3 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[color:var(--surface-sunken)] p-3" data-mail-felder>
            {hatTermin ? (
              <div className="grid grid-cols-2 gap-2" data-feld-termin>
                <label className="col-span-1">
                  <span className={label}>Termin am</span>
                  <input type="date" value={felder.terminTag} onChange={(e) => setF({ terminTag: e.target.value })} className={`${input} h-10`} />
                </label>
                <label className="col-span-1">
                  <span className={label}>Uhrzeit</span>
                  <input type="time" value={felder.terminZeit} onChange={(e) => setF({ terminZeit: e.target.value })} className={`${input} h-10`} />
                </label>
                <label className="col-span-2">
                  <span className={label}>Art</span>
                  <select value={felder.terminArt} onChange={(e) => setF({ terminArt: e.target.value === "video" ? "video" : "phone" })} className={`${input} h-10`}>
                    <option value="phone">Telefon</option>
                    <option value="video">Videocall</option>
                  </select>
                </label>
                {felder.terminArt === "video" ? (
                  <label className="col-span-2">
                    <span className={label}>Link zum Videocall (optional)</span>
                    <input value={felder.videolink} onChange={(e) => setF({ videolink: e.target.value })} placeholder="https://" className={`${input} h-10`} />
                  </label>
                ) : null}
                <p className="col-span-2 text-xs text-[color:var(--muted)]">Ergänzt die automatische Terminbestätigung, ersetzt sie nicht.</p>
              </div>
            ) : null}

            {hatUnterlagen ? (
              <fieldset data-feld-unterlagen>
                <legend className={label}>Was fehlt noch?</legend>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {UNTERLAGEN_OPTIONEN.map((o) => (
                    <label key={o} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0"
                        checked={felder.unterlagen.includes(o)}
                        onChange={(e) => setF({ unterlagen: e.target.checked ? [...felder.unterlagen, o] : felder.unterlagen.filter((x) => x !== o) })}
                      />
                      {o}
                    </label>
                  ))}
                </div>
                <input value={felder.unterlagenExtra} onChange={(e) => setF({ unterlagenExtra: e.target.value })} placeholder="Weitere Angabe (optional)" aria-label="Weitere Angabe" className={`${input} mt-2 h-10`} />
              </fieldset>
            ) : null}

            {hatVorteile ? (
              <fieldset className="space-y-2" data-feld-vorteile>
                <legend className={label}>Drei Vorteile des Angebots (kurz, aus Sicht Ihres Kunden)</legend>
                {([0, 1, 2] as const).map((i) => (
                  <input
                    key={i}
                    value={felder.vorteile[i]}
                    maxLength={140}
                    placeholder={["z. B. Operationen bis 5.000 Euro im Jahr abgesichert", "z. B. freie Tierarztwahl", "z. B. monatlich kündbar"][i]}
                    onChange={(e) => {
                      const v: [string, string, string] = [...felder.vorteile];
                      v[i] = e.target.value;
                      setF({ vorteile: v });
                    }}
                    aria-label={`Vorteil ${i + 1}`}
                    className={`${input} h-10`}
                  />
                ))}
                <span className="block text-xs text-[color:var(--muted)]">Nur, was im Angebot steht. Keine Zusagen darüber hinaus.</span>
              </fieldset>
            ) : null}

            {hatMelde ? (
              <label className="block" data-feld-melde>
                <span className={label}>Ich melde mich am</span>
                <input type="date" value={felder.meldeTag} min={inTagen(0)} onChange={(e) => setF({ meldeTag: e.target.value })} className={`${input} h-10`} />
                <span className="mt-1 block text-xs text-[color:var(--muted)]">Nach dem Senden legt die App die Wiedervorlage zu diesem Tag an.</span>
              </label>
            ) : null}

            {hatKuendigung ? (
              <div className="grid gap-2 sm:grid-cols-2" data-feld-kuendigung>
                <label className="sm:col-span-2">
                  <span className={label}>Bisheriger Versicherer</span>
                  <input value={felder.versicherer} onChange={(e) => setF({ versicherer: e.target.value })} className={`${input} h-10`} />
                </label>
                <label>
                  <span className={label}>Vertragsnummer</span>
                  <input value={felder.vertragsnummer} onChange={(e) => setF({ vertragsnummer: e.target.value })} className={`${input} h-10`} />
                </label>
                <label>
                  <span className={label}>Kündigen zum</span>
                  <input type="date" value={felder.kuendigungTag} onChange={(e) => setF({ kuendigungTag: e.target.value })} className={`${input} h-10`} />
                </label>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" className="h-4 w-4" checked={pdf} onChange={(e) => setPdf(e.target.checked)} />
                  Musterkündigung zusätzlich als PDF anhängen
                </label>
              </div>
            ) : null}

            {hatBeratung ? (
              <div className="space-y-2" data-feld-beratung>
                <p className="flex gap-2 rounded-[var(--radius-sm)] bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Vorbefüllt aus Formular und Assistent. Bitte prüfen und ergänzen Sie den Inhalt vor dem Senden; Rat und Gründe formulieren Sie selbst. Die App gibt keinen Rat.
                </p>
                <label className="block">
                  <span className={label}>Wünsche und Bedürfnisse</span>
                  <textarea value={felder.wuensche} onChange={(e) => setF({ wuensche: e.target.value })} rows={4} className={`${input} py-2`} />
                </label>
                {beratung.notizen.length ? (
                  <button
                    type="button"
                    onClick={() => setF({ wuensche: [felder.wuensche.trim(), ...beratung.notizen.map((n) => `• ${n.replace(/\s+/g, " ").trim()}`)].filter(Boolean).join("\n") })}
                    className="text-xs font-medium text-[color:var(--brand)] hover:underline"
                  >
                    Aus Ihren Notizen übernehmen ({beratung.notizen.length})
                  </button>
                ) : null}
                <label className="block">
                  <span className={label}>Rat und Gründe</span>
                  <textarea
                    value={felder.rat}
                    onChange={(e) => setF({ rat: e.target.value })}
                    rows={4}
                    placeholder="Welche Lösung Sie empfehlen und warum"
                    className={`${input} py-2`}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4" checked={pdf} onChange={(e) => setPdf(e.target.checked)} />
                  Als PDF anhängen und unter Dokumente ablegen
                </label>
              </div>
            ) : null}

            {veraltet && vorlage ? (
              <button type="button" onClick={() => fill(vorlage, felder)} className="text-sm font-medium text-[color:var(--brand)] hover:underline" data-felder-uebernehmen>
                Angaben in den Text übernehmen (ersetzt Ihre Änderungen)
              </button>
            ) : null}
          </div>
        ) : null}

        <input
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            setDirty(true);
          }}
          placeholder="Betreff"
          aria-label="Betreff"
          className={`${input} h-11`}
        />
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setDirty(true);
          }}
          rows={9}
          placeholder="Text"
          aria-label="Text"
          className={`${input} py-2.5`}
        />
        {dateien.length ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-[color:var(--muted)]">Anhängen</p>
            {dateien.map((d) => (
              <label key={d.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={files.has(d.id)}
                  onChange={(e) =>
                    setFiles((s) => {
                      const n = new Set(s);
                      if (e.target.checked) n.add(d.id);
                      else n.delete(d.id);
                      return n;
                    })
                  }
                />
                <Paperclip className="h-3.5 w-3.5 text-[color:var(--muted)]" />
                <span className="truncate">{d.fileName}</span>
              </label>
            ))}
          </div>
        ) : null}
        {nachfassen?.art === "beenden" ? (
          <p className="rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] px-3 py-2 text-sm" data-mail-remind>
            Nach dem Senden endet das automatische Nachfassen für diesen Kontakt, eine offene Wiedervorlage entfällt.
          </p>
        ) : nachfassen && nachfassen.art !== "melden" ? (
          <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] px-3 py-2 text-sm" data-mail-remind>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4" checked={remind} onChange={(e) => setRemind(e.target.checked)} />
              {nachfassen.art === "unterlagen"
                ? "Nach 3 Tagen automatisch erinnern, falls nichts kommt"
                : nachfassen.art === "nicht_erschienen"
                  ? "Erinnern, falls kein neuer Termin gebucht wird"
                  : "Erinnern, falls kein Termin gebucht wird"}
            </label>
            {nachfassen.art !== "unterlagen" ? (
              <select value={remindDays} onChange={(e) => setRemindDays(Number(e.target.value))} disabled={!remind} aria-label="Erinnern in" className="h-8 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2">
                <option value={1}>morgen</option>
                <option value={2}>in 2 Werktagen</option>
                <option value={5}>in 1 Woche</option>
              </select>
            ) : null}
          </div>
        ) : null}
        {fehlt ? <p className="text-xs text-[color:var(--muted)]">{fehlt}</p> : null}
        <MailWege
          appVersand={appVersand}
          senden={send}
          pending={pending}
          disabled={!!fehlt || !subject.trim() || !text.trim()}
          mail={{ to, subject, text }}
          signatur={signatur}
          anhaenge={dateien.filter((d) => files.has(d.id)).map((d) => ({ name: d.fileName, url: `/api/buyer/leads/${leadId}/dateien/${d.id}` }))}
          onGesendet={selbstGesendet}
        />
      </div>
    </Sheet>
  );
}
