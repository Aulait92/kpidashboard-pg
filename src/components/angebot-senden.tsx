"use client";

// Blatt „Angebot senden“ (Paket P3, Ole 17.11.2026). Wer: Vermittler nach dem Termin, oft am Handy. Aufgabe: das Angebot
// der Gesellschaft mit einem Weg loswerden, damit das Nachfassen startet. Ein Blatt für alle Stellen (Heute, „Wie lief der
// Termin?“, Kontakt, Terminvorbereitung Schritt 4) mit den bestehenden Bausteinen (Sheet, FileDrop, Button):
//   „Über die App senden“      PDF wählen bzw. hochladen (Pflicht), optional Kundenlink, ein Knopf „Jetzt senden“
//   „Habe ich selbst gesendet“ ein Tipp; danach freiwillig das PDF ablegen
//   „Später senden“            nur aus „Wie lief der Termin?“: Ergebnis setzen, Aufgabe bleibt auf „Heute“
// Paket M5 (Ole, 18.11.2026): Mailtext aus der Vorlage „Angebot“ unter „Texte ansehen“; Haken „Gesprächszusammenfassung
// mitsenden“ (Stufe „ein Tipp“) mit Editor, PDF im Anhang der Angebots-Mail. Nach „Habe ich selbst gesendet“ der
// Vorschlag „Zusammenfassung erstellen“: per App senden, im eigenen Mailprogramm (PDF teilen bzw. herunterladen) oder
// nur ablegen. Senden und Ablegen erst nach dem Ansehen der aktuellen Fassung.

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, ClipboardList, Clock, FileText, Loader2, Send, TriangleAlert, UserCheck } from "lucide-react";
import { Button } from "@/components/ui";
import { MailWege } from "@/components/mail-wege";
import { ZusammenfassungEditor, useZfPdf, zfBereit, zfHinweis, zfStart, type ZfZustand } from "@/components/zusammenfassung-editor";
import { FileDrop } from "@/components/ui/file-drop";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { SELBST_UPLOAD_HINWEIS, angebotStandText } from "@/lib/angebot-senden";
import type { AngebotInfo } from "@/lib/angebot-senden-server";
import {
  angebotAblegenResult,
  angebotInfoResult,
  angebotSelbstResult,
  angebotSendenResult,
  zusammenfassungAblegenResult,
  zusammenfassungSelbstResult,
  zusammenfassungSendenResult,
} from "@/app/buyer/angebot-actions";

const tag = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "numeric", month: "numeric" }).format(new Date(iso));

export type AngebotZiel = { appointmentId: string; name: string };

type SheetProps = {
  ziel: AngebotZiel | null;
  onClose: () => void;
  /** Erfolgreich gesendet bzw. vermerkt: Meldung für den Toast */
  onDone: (message: string) => void;
  onError: (message: string) => void;
  /** Nur aus „Wie lief der Termin?“: Ergebnis setzen und später senden */
  spaeter?: () => void;
};

export function AngebotSendenSheet(p: SheetProps) {
  // Je Termin neu (key): Zustand beginnt leer, ohne Zurücksetzen im Effekt
  return p.ziel ? <AngebotSendenBlatt key={p.ziel.appointmentId} {...p} ziel={p.ziel} /> : null;
}

function AngebotSendenBlatt({ ziel, onClose, onDone, onError, spaeter }: SheetProps & { ziel: AngebotZiel }) {
  const [info, setInfo] = useState<AngebotInfo | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [schritt, setSchritt] = useState<"wahl" | "app" | "selbst" | "zusammenfassung">("wahl");
  const [datei, setDatei] = useState<string | null>(null);
  const [kundenlink, setKundenlink] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const [abgelegt, setAbgelegt] = useState<string | null>(null);
  // Gesprächszusammenfassung (Paket M5): mitsenden (Weg „app“) bzw. nach „selbst gesendet“; zfFertig = abgelegt
  const [zfMit, setZfMit] = useState(false);
  const [zf, setZf] = useState<ZfZustand | null>(null);
  const [zfFertig, setZfFertig] = useState<{ dateiId: string; text: string } | null>(null);
  const [busy, start] = useTransition();
  const id = ziel.appointmentId;
  const zfPdf = useZfPdf(id, zf ?? { wuensche: "", rat: "", ki: false, ansicht: false, geprueft: false });

  useEffect(() => {
    let weg = false;
    void angebotInfoResult(id).then((r) => {
      if (weg) return;
      if (!r.ok) return setFehler(r.error);
      setInfo(r.info);
      if (r.info.zusammenfassung) setZf(zfStart(r.info.zusammenfassung));
      setDatei(r.info.vorausgewaehlt);
      setKundenlink(r.info.kundenlink === "aktiv");
    });
    return () => {
      weg = true;
    };
  }, [id]);

  async function hochladen(files: File[]): Promise<string | null> {
    const f = files[0];
    if (!f || !info) return null;
    setLaedt(true);
    try {
      const res = await fetch(`/api/buyer/leads/${info.leadId}/dateien?kind=angebot`, {
        method: "POST",
        headers: { "x-file-name": encodeURIComponent(f.name), "content-type": "application/octet-stream" },
        body: f,
      });
      const j = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !j.id) throw new Error(j.error ?? "Hochladen hat nicht geklappt.");
      const neu = { id: j.id, fileName: f.name, createdAt: new Date().toISOString() };
      setInfo((i) => (i ? { ...i, dateien: [neu, ...i.dateien] } : i));
      setDatei(j.id);
      return j.id;
    } catch (e) {
      onError(e instanceof Error ? e.message : "Hochladen hat nicht geklappt.");
      return null;
    } finally {
      setLaedt(false);
    }
  }

  const senden = () =>
    start(async () => {
      if (!datei) return;
      const mitZf = zfMit && zf && info?.zusammenfassung ? { wuensche: zf.wuensche, rat: zf.rat, ki: zf.ki } : null;
      const r = await angebotSendenResult(ziel.appointmentId, { dateiId: datei, kundenlink, zusammenfassung: mitZf });
      if (!r.ok) return onError(r.error);
      onDone(`${ziel.name}: ${r.message}`);
      onClose();
    });

  const selbst = () =>
    start(async () => {
      const r = await angebotSelbstResult(ziel.appointmentId);
      if (!r.ok) return onError(r.error);
      onDone(`${ziel.name}: ${r.message}`);
      setSchritt("selbst");
    });

  const ablegen = async (files: File[]) => {
    const dateiId = await hochladen(files);
    if (!dateiId) return;
    const r = await angebotAblegenResult(ziel.appointmentId, dateiId);
    if (!r.ok) return onError(r.error);
    setAbgelegt(files[0]?.name ?? "PDF");
  };

  const zfText = zf ? { wuensche: zf.wuensche, rat: zf.rat, ki: zf.ki } : null;
  const zfErledigt = (dateiId: string, text: string) => {
    setZfFertig({ dateiId, text });
    setSchritt("selbst");
  };
  const zfSenden = () =>
    start(async () => {
      if (!zfText) return;
      const r = await zusammenfassungSendenResult(id, zfText);
      if (!r.ok) return onError(r.error);
      onDone(`${ziel.name}: ${r.message}`);
      zfErledigt(r.dateiId, "Zusammenfassung gesendet und abgelegt");
    });
  const zfAblegen = () =>
    start(async () => {
      if (!zfText) return;
      const r = await zusammenfassungAblegenResult(id, zfText);
      if (!r.ok) return onError(r.error);
      onDone(`${ziel.name}: ${r.message}`);
      zfErledigt(r.dateiId, "Zusammenfassung abgelegt");
    });
  const zfMail = info?.zusammenfassung
    ? {
        to: info.zusammenfassung.email ?? "",
        subject: info.zusammenfassung.mail.subject,
        text: info.zusammenfassung.mail.body.split("{wuensche}").join(zf?.wuensche.trim() ?? "").split("{rat}").join(zf?.rat.trim() ?? ""),
      }
    : null;
  const zfSelbst = async () => {
    if (!zfText || !zfMail) return;
    const r = await zusammenfassungSelbstResult(id, { ...zfText, ...zfMail });
    if (!r.ok) return onError(r.error);
    onDone(`${ziel.name}: ${r.message}`);
    zfErledigt(r.dateiId, "Zusammenfassung gesendet und abgelegt");
  };

  const stand = info ? angebotStandText(info.stand) : null;
  const wa = info?.whatsapp;
  const waGeht = !!wa?.moeglich && (wa.fensterOffen || wa.vorlage);
  const kanalFehlt = !!info && !waGeht && !info.email;

  return (
    <Sheet
      open
      onClose={onClose}
      title={schritt === "app" ? "Über die App senden" : schritt === "zusammenfassung" ? `Gesprächszusammenfassung: ${ziel.name}` : `Angebot senden: ${ziel.name}`}
    >
      {!info ? (
        <div className="flex items-center gap-2 px-5 py-6 text-sm text-[color:var(--muted)]">
          {fehler ? (
            <>
              <TriangleAlert className="h-4 w-4 text-amber-600" /> {fehler}
            </>
          ) : (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Lädt …
            </>
          )}
        </div>
      ) : schritt === "wahl" ? (
        <div data-angebot-wahl>
          {stand ? (
            <p className="flex items-center gap-2 border-b border-[color:var(--border)] bg-emerald-50 px-5 py-2.5 text-sm font-medium text-emerald-800" data-angebot-stand>
              <CheckCircle2 className="h-4 w-4 shrink-0" /> {stand}
            </p>
          ) : null}
          <ul className="divide-y divide-[color:var(--border)]">
            <Wahl icon={Send} titel="Über die App senden" text="Per WhatsApp und E-Mail, danach fasst die App nach." primary onClick={() => setSchritt("app")} data="app" />
            <Wahl icon={UserCheck} titel="Habe ich selbst gesendet" text="Die App fasst nur per WhatsApp nach." onClick={selbst} disabled={busy} data="selbst" />
            {spaeter ? (
              <Wahl
                icon={Clock}
                titel="Später senden"
                text="Steht dann auf Heute unter „Angebote senden“."
                onClick={() => {
                  onClose();
                  spaeter();
                }}
                data="spaeter"
              />
            ) : null}
          </ul>
        </div>
      ) : schritt === "selbst" ? (
        <div className="space-y-4 px-5 py-5" data-angebot-selbst-fertig>
          <p className="flex items-center gap-2 text-[15px] font-semibold text-emerald-700">
            <CheckCircle2 className="h-5 w-5" /> Vermerkt: selbst gesendet
          </p>
          {abgelegt ? (
            <p className="flex items-center gap-2 text-sm" data-angebot-abgelegt>
              <FileText className="h-4 w-4 text-[color:var(--muted)]" /> Abgelegt: {abgelegt}
            </p>
          ) : (
            <FileDrop variant="button" instant accept=".pdf,application/pdf,image/*" label="PDF ablegen" busy={laedt} onFiles={(f) => void ablegen(f)} hint={SELBST_UPLOAD_HINWEIS} />
          )}
          {info.zusammenfassung ? (
            zfFertig || info.zusammenfassung.abgelegt ? (
              <p className="flex items-center gap-2 text-sm" data-zf-abgelegt>
                <ClipboardList className="h-4 w-4 text-[color:var(--muted)]" /> {zfFertig?.text ?? `Zusammenfassung abgelegt am ${tag(info.zusammenfassung.abgelegt!.createdAt)}`}
              </p>
            ) : (
              <div className="border-t border-[color:var(--border)] pt-4" data-zf-vorschlag>
                <p className="text-[15px] font-semibold">Gesprächszusammenfassung</p>
                <p className="mb-2 text-xs text-[color:var(--muted)]">Für Ihre Beratungsdokumentation, vorbefüllt aus dem Termin.</p>
                <Button variant="secondary" size="md" icon={ClipboardList} className="w-full" onClick={() => setSchritt("zusammenfassung")} data-zf-erstellen>
                  {info.zusammenfassung.appVersand ? "Ablegen oder per App senden" : "Erstellen und ablegen"}
                </Button>
              </div>
            )
          ) : null}
          <Button variant="secondary" className="h-11 w-full" onClick={onClose}>
            Fertig
          </Button>
        </div>
      ) : schritt === "zusammenfassung" && info.zusammenfassung && zf ? (
        <div className="space-y-4 px-5 py-4" data-zf-schritt>
          <ZusammenfassungEditor appointmentId={id} info={info.zusammenfassung} wert={zf} onChange={setZf} onError={onError} pdf={zfPdf} />
          {zfHinweis(zf) ? <p className="text-xs text-[color:var(--muted)]" data-zf-hinweis>{zfHinweis(zf)}</p> : null}
          {zfMail ? (
            <MailWege
              appVersand={info.zusammenfassung.appVersand}
              senden={zfSenden}
              pending={busy}
              disabled={!zfBereit(zf) || busy}
              mail={zfMail}
              signatur={null}
              anhaenge={zfPdf ? [zfPdf] : []}
              onGesendet={zfSelbst}
              sendenLabel="Per App senden"
            />
          ) : null}
          <button
            type="button"
            className="inline-flex min-h-10 w-full items-center justify-center text-sm font-medium text-[color:var(--muted)] hover:text-[color:var(--foreground)] disabled:opacity-50"
            disabled={!zfBereit(zf) || busy}
            onClick={zfAblegen}
            data-zf-nur-ablegen
          >
            Nur ablegen, nicht senden
          </button>
        </div>
      ) : (
        <div className="space-y-4 px-5 py-4" data-angebot-app>
          <section>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">Angebot der Gesellschaft (PDF)</h3>
            {info.dateien.length ? (
              <ul className="mb-2 space-y-1">
                {info.dateien.map((f) => (
                  <li key={f.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-1 text-sm hover:bg-[color:var(--surface-sunken)]">
                      <input type="radio" name="angebot-datei" className="h-4 w-4 accent-[color:var(--brand)]" checked={datei === f.id} onChange={() => setDatei(f.id)} />
                      <FileText className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
                      <span className="min-w-0 flex-1 truncate">{f.fileName}</span>
                      <span className="shrink-0 text-xs text-[color:var(--muted)]">{tag(f.createdAt)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : null}
            <FileDrop
              variant="button"
              instant
              accept=".pdf,application/pdf,image/*"
              label={info.dateien.length ? "Anderes PDF hochladen" : "PDF hochladen"}
              buttonVariant={info.dateien.length ? "secondary" : "primary"}
              busy={laedt}
              onFiles={(f) => void hochladen(f)}
              hint={info.dateien.length ? null : "Liegt danach unter Dokumente am Kontakt."}
            />
          </section>
          {info.kundenlink ? (
            <label className="flex cursor-pointer items-start gap-3 text-sm" data-angebot-kundenlink>
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[color:var(--brand)]" checked={kundenlink} onChange={(e) => setKundenlink(e.target.checked)} />
              <span>
                Link zur Präsentation mitsenden
                <span className="block text-xs text-[color:var(--muted)]">Ihr Kunde sieht die Beratung 14 Tage online.</span>
              </span>
            </label>
          ) : null}
          <ul className="space-y-1 text-sm" data-angebot-kanaele>
            <Kanal ok={waGeht} text={waGeht ? "WhatsApp" : `WhatsApp: ${wa?.grund ?? "Chat ruht seit über 24 Stunden"}`} />
            <Kanal ok={!!info.email} text={info.email ? `E-Mail an ${info.email}` : "E-Mail: keine Adresse bekannt"} />
          </ul>
          {info.zusammenfassung && info.email && zf ? (
            <section className="space-y-3" data-zf-mit>
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[color:var(--brand)]" checked={zfMit} onChange={(e) => setZfMit(e.target.checked)} data-zf-haken />
                <span>
                  Gesprächszusammenfassung mitsenden
                  <span className="block text-xs text-[color:var(--muted)]">Als PDF im Anhang der E-Mail, liegt danach unter Dokumente.</span>
                </span>
              </label>
              {zfMit ? <ZusammenfassungEditor appointmentId={id} info={info.zusammenfassung} wert={zf} onChange={setZf} onError={onError} pdf={zfPdf} /> : null}
            </section>
          ) : null}
          {info.kombi ? <p className="text-xs text-[color:var(--muted)]">Mit Hinweis: {info.kombi}</p> : null}
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-[color:var(--brand)]">Texte ansehen</summary>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">WhatsApp</p>
            <p className="mt-1 whitespace-pre-line rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] px-3 py-2.5" data-angebot-vorschau>
              {info.vorschau}
            </p>
            {info.email ? (
              <>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">E-Mail</p>
                <div className="mt-1 rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] px-3 py-2.5" data-angebot-mail-vorschau>
                  <p className="font-semibold">{info.mail.subject}</p>
                  <p className="mt-1 whitespace-pre-line">{info.mail.text}</p>
                </div>
              </>
            ) : null}
          </details>
          {kanalFehlt ? (
            <p className="text-sm text-amber-800">Weder WhatsApp noch E-Mail möglich. Senden Sie es selbst und tippen Sie danach „Habe ich selbst gesendet“.</p>
          ) : null}
          {zfMit && zf && zfHinweis(zf) ? <p className="text-xs text-[color:var(--muted)]" data-zf-hinweis>{zfHinweis(zf)}</p> : null}
          <Button
            variant="primary"
            icon={busy ? Loader2 : Send}
            className="h-11 w-full text-[15px]"
            disabled={!datei || busy || laedt || kanalFehlt || (zfMit && !!zf && !zfBereit(zf))}
            onClick={senden}
            data-angebot-jetzt-senden
          >
            {busy ? "Sendet …" : "Jetzt senden"}
          </Button>
        </div>
      )}
    </Sheet>
  );
}

function Wahl({
  icon: Icon,
  titel,
  text,
  onClick,
  primary,
  disabled,
  data,
}: {
  icon: typeof Send;
  titel: string;
  text: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
  data: string;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex min-h-14 w-full items-start gap-3 px-5 py-3 text-left transition hover:bg-[color:var(--surface-sunken)] active:bg-[color:var(--surface-sunken)] disabled:opacity-50"
        data-angebot-weg={data}
      >
        <Icon className={cn("mt-0.5 h-[18px] w-[18px] shrink-0", primary ? "text-[color:var(--brand)]" : "text-[color:var(--muted)]")} />
        <span className="min-w-0">
          <span className={cn("block text-[15px]", primary ? "font-semibold text-[color:var(--brand)]" : "text-[color:var(--foreground)]")}>{titel}</span>
          <span className="block text-xs text-[color:var(--muted)]">{text}</span>
        </span>
      </button>
    </li>
  );
}

function Kanal({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className={cn("flex items-center gap-2", ok ? "text-[color:var(--foreground)]" : "text-amber-800")}>
      {ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600" />}
      <span className="min-w-0 break-words">{text}</span>
    </li>
  );
}
