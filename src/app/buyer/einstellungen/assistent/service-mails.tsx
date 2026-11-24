"use client";

// „Service-Mails in Ihrem Namen“ (Ole, 17.11.2026, Paket M9, freigegebene Sie-Texte aus docs/plan-mail-vorlagen.md).
// Vor der Bestätigung: Erklärschritt mit Vorschau einer echten Terminbestätigung, fehlenden Signaturangaben (Live-
// Vorschau) und einer Hauptaktion „Ja, Mails in meinem Namen senden“; „Selbst entscheiden je Mail“ öffnet die Liste.
// Danach: Absender, Kopie jeder Mail und dieselbe Liste (automatisch / ein Tipp / aus je Vorlage, später M7).
// Bei „E-Mail-Funktionen aus“ nur der Hinweis auf Kopieren und eigenes Mailprogramm.

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarCheck, ChevronDown, Copy, Inbox, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { ABLAUF_VORLAGEN, AUSLOESER_AKTIV, MAIL_STUFEN, NUR_TIPP, STUFE_LABEL, VORLAGE_WANN, type MailStufe } from "@/lib/mail/ablauf";
import type { ServiceMailVorschau, SignaturAngaben } from "@/lib/mail/service-mails";
import type { Antwortweg, ServiceMailsDaten } from "@/lib/mail/service-mails-daten";
import type { VorlageKey } from "@/lib/mail/vorlagen";
import { cn } from "@/lib/utils";
import { serviceMailsBestaetigenAction, serviceMailVorschauAction, setMailKopieAction, setMailStufeAction, signaturAngabenAction } from "./actions";

const input =
  "h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-[15px] outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20 disabled:bg-[color:var(--surface-sunken)]";
const card = "overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]";

const FELDER: { key: keyof SignaturAngaben; label: string; placeholder: string }[] = [
  { key: "name", label: "Vor- und Nachname", placeholder: "z. B. Max Mustermann" },
  { key: "firma", label: "Agentur", placeholder: "z. B. Mustermann Versicherungen" },
  { key: "telefon", label: "Telefon", placeholder: "z. B. 089 123456" },
  { key: "anschrift", label: "Anschrift", placeholder: "Straße, PLZ Ort" },
];

export function ServiceMails(p: ServiceMailsDaten & {
  canEdit: boolean;
  /** Einrichtung (P8): nach „Ja“ zum nächsten Schritt statt neu laden */
  weiterHref?: string;
}) {
  if (p.mailOff) {
    return (
      <div className={`${card} p-5`} data-service-mails="aus">
        <h3 className="text-lg font-semibold tracking-tight">E-Mails übernehmen Sie mit einem Tipp</h3>
        <p className="mt-1 text-[15px] text-[color:var(--muted)]">
          Ihr Versicherer erlaubt keine E-Mails aus anderen Programmen. Deshalb sendet die App Ihre E-Mail-Vorlagen nicht selbst: Im Kontakt kopieren Sie den
          passenden Text oder öffnen ihn im eigenen Mailprogramm.
        </p>
        <Link href="/buyer/postfach" className="mt-3 inline-flex min-h-10 items-center text-sm font-medium text-[color:var(--brand)] hover:underline">
          Ändern unter E-Mail-Postfach
        </Link>
      </div>
    );
  }
  return p.bestaetigt ? <Eingerichtet {...p} /> : <Erklaerschritt {...p} />;
}

/** Erklärschritt (vor der Bestätigung). */
function Erklaerschritt(p: Parameters<typeof ServiceMails>[0]) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  // Vorausgefüllt zum Bestätigen (Ole, 18.11.2026): Telefon aus dem CRM, Anrede aus dem Vornamen
  const [angaben, setAngaben] = useState<SignaturAngaben>(() => ({ ...p.angaben, telefon: p.angaben.telefon || p.vorschlaege?.telefon || "" }));
  const [stufen, setStufen] = useState(p.stufen);
  const [liste, setListe] = useState(false);
  const [anrede, setAnrede] = useState<string>(p.vorschlaege?.anrede ?? "");
  // Angaben, die weiter oben (Erstinformation) erst später gespeichert werden, in leere Felder übernehmen (Ole, 20.11.2026)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nur leere Felder nachfüllen, wenn neue Angaben vom Server kommen
    setAngaben((cur) => {
      const next = { ...cur };
      for (const k of Object.keys(p.angaben) as (keyof SignaturAngaben)[]) if (!cur[k]?.trim() && p.angaben[k]?.trim()) next[k] = p.angaben[k];
      return next;
    });
  }, [p.angaben]);
  const vorschau = useLiveVorschau(p.vorschau, angaben, p.fehlend.length > 0);
  const anredeOffen = p.anredeFehlt && p.canEdit && !anrede;

  const ja = () =>
    start(async () => {
      const res = await serviceMailsBestaetigenAction({ stufen, angaben: p.fehlend.length ? angaben : undefined, anrede: p.anredeFehlt ? anrede : undefined });
      if (!res.ok) return toast.show({ message: res.error, tone: "error" });
      toast.show({ message: "Gespeichert: Ihre Service-Mails tragen ab jetzt Ihren Namen." });
      // Einrichtung: neu laden, damit der nächste Schritt aufgeklappt ist
      if (p.weiterHref) window.location.assign(p.weiterHref);
      else router.refresh();
    });

  return (
    <div className={`${card} p-5 sm:p-6`} data-service-mails="erklaerung">
      <h3 className="text-xl font-bold tracking-tight">Ihre Kunden bekommen jede wichtige Mail. Sie schreiben keine davon.</h3>
      <p className="mt-2 text-[15px] text-[color:var(--muted)]">
        Terminbestätigung, Erinnerung, „Ich habe Sie nicht erreicht“: Diese Mails schicken wir automatisch in Ihrem Namen. Absender ist Ihr Name, unten steht Ihre
        Signatur, Antworten landen direkt bei Ihnen. Für Ihre Kunden kommt die Mail von Ihnen.
      </p>
      <ul className="mt-4 space-y-2.5 text-[15px]" data-service-mails-punkte>
        <Punkt icon={CalendarCheck}>
          <b>Weniger vergessene Termine:</b> Bestätigung mit Kalendereintrag und Erinnerung am Vortag.
        </Punkt>
        <Punkt icon={Inbox}>
          <b>Nichts geht verloren:</b> Sie bekommen eine Kopie jeder Mail in Ihr Postfach.
        </Punkt>
        <Punkt icon={Send}>
          <b>Angebote und Vertragsunterlagen</b> schicken Sie weiter wie gewohnt, auf Wunsch auch aus dem System Ihres Versicherers.
        </Punkt>
      </ul>

      {(p.fehlend.length || p.anredeFehlt) && p.canEdit ? (
        <div className="mt-5" data-service-mails-angaben>
          <p className="mb-2 text-sm font-medium">{p.vorschlaege?.anrede || p.vorschlaege?.telefon ? "Für Ihre Signatur, bitte kurz prüfen:" : "Für Ihre Signatur fehlt noch:"}</p>
          {p.anredeFehlt ? (
            <label className="mb-3 block" data-signatur-feld="anrede">
              <span className="mb-1 block text-xs font-medium text-[color:var(--muted)]">
                Anrede (Ihre Kunden lesen z. B. „Herr Mustermann“){p.vorschlaege?.anrede && anrede === p.vorschlaege.anrede ? ", vorausgewählt, bitte prüfen" : ""}
              </span>
              <select value={anrede} onChange={(e) => setAnrede(e.target.value)} className={`${input} sm:w-48`} required>
                <option value="">Bitte wählen</option>
                <option value="Herr">Herr</option>
                <option value="Frau">Frau</option>
                <option value="keine">Keine Anrede</option>
              </select>
            </label>
          ) : null}
          {p.fehlend.length ? <Angaben felder={FELDER.filter((f) => p.fehlend.includes(f.key))} angaben={angaben} onChange={setAngaben} /> : null}
        </div>
      ) : null}

      <div className="mt-5">
        <Vorschau v={vorschau} />
      </div>

      {liste ? (
        <div className="mt-5" data-service-mails-liste-offen>
          <StufenListe stufen={stufen} namen={p.namen} disabled={!p.canEdit} onChange={(k, s) => setStufen((cur) => ({ ...cur, [k]: s }))} />
        </div>
      ) : null}

      <Button variant="primary" size="md" className="mt-5 w-full" onClick={ja} disabled={pending || !p.canEdit || anredeOffen} data-service-mails-ja>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Ja, Mails in meinem Namen senden
      </Button>
      {!liste ? (
        <button
          type="button"
          onClick={() => setListe(true)}
          className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-1 text-sm font-medium text-[color:var(--brand)] hover:underline"
          data-service-mails-selbst
        >
          Selbst entscheiden je Mail <ChevronDown className="h-4 w-4" />
        </button>
      ) : null}
      <p className="mt-2 text-center text-xs text-[color:var(--muted)]">Sie können das jederzeit ändern. Ist Ihr Postfach verbunden, senden wir direkt von Ihrer Adresse.</p>
    </div>
  );
}

/** Nach der Bestätigung: Absender, Kopie, Liste je Mail, Beispiel und Signatur. */
function Eingerichtet(p: Parameters<typeof ServiceMails>[0]) {
  const router = useRouter();
  const toast = useToast();
  const [stufen, setStufen] = useState(p.stufen);
  const [kopieAn, setKopieAn] = useState(p.kopie.an);
  const [adresse, setAdresse] = useState(p.kopie.adresse ?? "");
  const [angaben, setAngaben] = useState<SignaturAngaben>(p.angaben);
  const [pending, start] = useTransition();
  const [offen, setOffen] = useState(false);
  const vorschau = useLiveVorschau(p.vorschau, angaben, offen);

  const stufe = (k: VorlageKey, s: MailStufe) => {
    const alt = stufen[k];
    setStufen((cur) => ({ ...cur, [k]: s }));
    start(async () => {
      const res = await setMailStufeAction(k, s);
      if (!res.ok) {
        setStufen((cur) => ({ ...cur, [k]: alt }));
        toast.show({ message: res.error, tone: "error" });
      }
    });
  };
  const kopie = (an: boolean) =>
    start(async () => {
      const res = await setMailKopieAction({ an, adresse });
      if (!res.ok) return toast.show({ message: res.error, tone: "error" });
      setKopieAn(an);
      toast.show({ message: an ? "Kopie an" : "Kopie aus" });
    });
  const speichereAngaben = () =>
    start(async () => {
      const res = await signaturAngabenAction(angaben);
      if (!res.ok) return toast.show({ message: res.error, tone: "error" });
      toast.show({ message: "Signatur gespeichert" });
      router.refresh();
    });

  return (
    <div className="space-y-3" data-service-mails="eingerichtet">
      <div className={`${card} divide-y divide-[color:var(--border)]`}>
        <div className="px-5 py-4">
          <p className="text-xs font-medium text-[color:var(--muted)]">Absender</p>
          <p className="font-medium" data-service-mails-von>
            {p.vorschau.von}
          </p>
          {p.vorschau.adresse ? <p className="text-xs text-[color:var(--muted)]">{p.vorschau.adresse}</p> : null}
        </div>
        <AntwortwegZeile w={p.antwortweg} />
        {p.vorschau.postfach ? (
          <p className="px-5 py-4 text-sm text-[color:var(--muted)]">Ihr Postfach ist verbunden: Jede Mail liegt auch in Ihrem Ordner „Gesendet“.</p>
        ) : (
          <div className="space-y-2 px-5 py-4" data-service-mails-kopie>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={kopieAn} disabled={pending || !p.canEdit} onChange={(e) => kopie(e.target.checked)} />
              <span>
                <span className="block font-medium">Kopie jeder Mail an mich</span>
                <span className="block text-xs text-[color:var(--muted)]">{adresse.trim() || p.kopie.eigene || "Ihre Adresse"}</span>
              </span>
            </label>
            {kopieAn && p.canEdit ? (
              <details className="pl-7">
                <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 text-xs font-medium text-[color:var(--brand)] [&::-webkit-details-marker]:hidden">
                  An eine andere Adresse <ChevronDown className="h-3.5 w-3.5" />
                </summary>
                <div className="mt-2 flex gap-2">
                  <input
                    type="email"
                    value={adresse}
                    onChange={(e) => setAdresse(e.target.value)}
                    placeholder={p.kopie.eigene ?? "name@beispiel.de"}
                    aria-label="Kopie an"
                    className={`${input} h-10`}
                  />
                  <Button variant="secondary" size="sm" className="h-10 shrink-0" onClick={() => kopie(true)} disabled={pending}>
                    Speichern
                  </Button>
                </div>
              </details>
            ) : null}
          </div>
        )}
      </div>

      <div className={`${card} px-5 py-4`}>
        <p className="text-sm font-semibold">Was die App mit jeder Mail macht</p>
        <p className="mb-1 text-xs text-[color:var(--muted)]">Automatisch, mit einem Tipp von Ihnen oder gar nicht.</p>
        <StufenListe stufen={stufen} namen={p.namen} disabled={!p.canEdit || pending} onChange={stufe} />
      </div>

      <details className={`${card} group`} onToggle={(e) => setOffen((e.target as HTMLDetailsElement).open)} data-service-mails-beispiel>
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-5 text-sm font-medium [&::-webkit-details-marker]:hidden">
          Beispiel und Signatur
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-4 px-5 pb-5">
          <Vorschau v={vorschau} />
          {p.canEdit ? (
            <>
              <Angaben felder={FELDER} angaben={angaben} onChange={setAngaben} />
              <Button variant="secondary" size="sm" onClick={speichereAngaben} disabled={pending}>
                Signatur speichern
              </Button>
            </>
          ) : null}
        </div>
      </details>
    </div>
  );
}

/** Antwortweg (M7): wohin Antworten der Kunden gehen. */
function AntwortwegZeile({ w }: { w: Antwortweg }) {
  return (
    <div className="px-5 py-4" data-service-mails-antwortweg={w.art}>
      <p className="text-xs font-medium text-[color:var(--muted)]">Antworten Ihrer Kunden</p>
      {w.art === "postfach" ? (
        <p className="text-sm">Antworten gehen direkt in Ihr Postfach.</p>
      ) : w.art === "eingang" ? (
        <>
          <p className="text-sm">Landen im Verlauf des Kontakts und als Weiterleitung bei Ihnen.</p>
          <p className="break-all text-xs text-[color:var(--muted)]">Antwortadresse je Kontakt: {w.muster}</p>
        </>
      ) : (
        <>
          <p className="text-sm">Antworten gehen an Ihre Adresse.</p>
          {w.adresse ? <p className="break-all text-xs text-[color:var(--muted)]">{w.adresse}</p> : null}
        </>
      )}
    </div>
  );
}

function Punkt({ icon: Icon, children }: { icon: typeof Copy; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-[color:var(--brand)]">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function Angaben({ felder, angaben, onChange }: { felder: typeof FELDER; angaben: SignaturAngaben; onChange: (a: SignaturAngaben) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {felder.map((f) => (
        <label key={f.key} className={cn("min-w-0", f.key === "anschrift" && "sm:col-span-2")}>
          <span className="mb-1 block text-xs font-medium text-[color:var(--muted)]">{f.label}</span>
          <input
            value={angaben[f.key]}
            onChange={(e) => onChange({ ...angaben, [f.key]: e.target.value })}
            placeholder={f.placeholder}
            className={input}
            autoComplete={f.key === "name" ? "name" : f.key === "firma" ? "organization" : f.key === "telefon" ? "tel" : "street-address"}
            data-signatur-feld={f.key}
          />
        </label>
      ))}
    </div>
  );
}

/** Vorschau aus denselben Funktionen wie der Versand (aktualisiert sich beim Tippen). */
function useLiveVorschau(start: ServiceMailVorschau, angaben: SignaturAngaben, aktiv: boolean): ServiceMailVorschau {
  const [v, setV] = useState(start);
  const erste = useRef(true);
  useEffect(() => {
    if (!aktiv) return;
    if (erste.current) {
      erste.current = false;
      return;
    }
    const t = setTimeout(async () => {
      const res = await serviceMailVorschauAction(angaben).catch(() => null);
      if (res?.ok) setV(res.vorschau);
    }, 400);
    return () => clearTimeout(t);
  }, [angaben, aktiv]);
  return v;
}

/** Mail-Vorschau: Absender (Anzeigename, darunter klein die technische Adresse), Betreff, Inhalt eingeklappt. */
function Vorschau({ v }: { v: ServiceMailVorschau }) {
  const [ganz, setGanz] = useState(false);
  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-sunken)]" data-service-mails-vorschau>
      <div className="border-b border-[color:var(--border)] bg-white px-4 py-3 text-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--muted)]">Beispiel: Terminbestätigung</p>
        <p className="mt-1 break-words font-semibold" data-vorschau-von>
          {v.von}
        </p>
        {v.adresse ? (
          <p className="break-all text-xs text-[color:var(--muted)]" data-vorschau-adresse>
            {v.adresse}
          </p>
        ) : null}
        <p className="mt-1 break-words">{v.subject}</p>
      </div>
      <div className={cn("relative bg-white", !ganz && "max-h-56 overflow-hidden")}>
        {/* Selbst erzeugtes HTML (lib/calendar/lead-email.ts leadEmailBody, alle Werte maskiert) */}
        <div className="text-[14px] [&_a]:break-all" dangerouslySetInnerHTML={{ __html: v.html }} />
        {!ganz ? <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" /> : null}
      </div>
      {!ganz ? (
        <button type="button" onClick={() => setGanz(true)} className="flex min-h-10 w-full items-center justify-center gap-1 bg-white text-sm font-medium text-[color:var(--brand)]">
          Ganze Mail ansehen <ChevronDown className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

/** Liste je Vorlage: automatisch / ein Tipp / aus (Einstellungen → Assistent, später auch M7). */
export function StufenListe({
  stufen,
  namen,
  disabled,
  onChange,
}: {
  stufen: Record<VorlageKey, MailStufe>;
  namen: Record<VorlageKey, string>;
  disabled?: boolean;
  onChange: (k: VorlageKey, s: MailStufe) => void;
}) {
  return (
    <ul className="divide-y divide-[color:var(--border)]" data-mail-stufen>
      {ABLAUF_VORLAGEN.map((k) => (
        <li key={k} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between" data-mail-stufe={k}>
          <div className="min-w-0">
            <p className="text-[15px] font-medium">{namen[k]}</p>
            <p className="text-xs text-[color:var(--muted)]">
              {VORLAGE_WANN[k]}
              {stufen[k] === "auto" && !AUSLOESER_AKTIV.has(k) ? ", automatisch bald verfügbar" : ""}
            </p>
          </div>
          <div className="grid shrink-0 grid-cols-3 gap-1 rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] p-1 sm:w-[300px]" role="radiogroup" aria-label={namen[k]}>
            {MAIL_STUFEN.map((s) => {
              const gesperrt = s === "auto" && NUR_TIPP.has(k);
              const an = stufen[k] === s;
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={an}
                  disabled={disabled || gesperrt}
                  title={gesperrt ? "Diese Mail prüfen Sie vor dem Senden" : undefined}
                  onClick={() => !an && onChange(k, s)}
                  className={cn(
                    "h-8 rounded-[6px] px-2 text-xs font-medium transition disabled:cursor-not-allowed",
                    an ? "bg-white text-[color:var(--foreground)] shadow-[var(--shadow-sm)]" : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
                    gesperrt && "opacity-40",
                  )}
                >
                  {STUFE_LABEL[s]}
                </button>
              );
            })}
          </div>
        </li>
      ))}
    </ul>
  );
}
