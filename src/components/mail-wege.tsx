"use client";

// Drei Wege für eine E-Mail an einen Lead (Ole, 17.11.2026, Paket M1, docs/plan-mail-vorlagen.md Regel 4):
//   „Über die App senden“ (Postfach bzw. unsere Versanddomain), „Im eigenen Mailprogramm öffnen“ (mailto) und
//   „Text kopieren“ (z. B. ins System der Gesellschaft). Nach mailto oder Kopieren fragt die Komponente beim
//   Zurückkehren „Gesendet?“: Ja → onGesendet (Eintrag im Verlauf, Folgen wie Nachfassen), Nein ändert nichts.
// Bei „E-Mail-Funktionen aus“ (mailFeaturesOff) bzw. ohne Versandweg nur mailto und Kopieren.
// mailto ohne Signatur (das Mailprogramm setzt seine eigene), zu lange Texte über die Zwischenablage (lib/mail/mailto.ts).
// Anhänge gehen im mailto nicht: auf dem Handy „PDF teilen“ (Web Share mit Dateien), am Rechner „PDF herunterladen“.
// Genutzt im Dialog „E-Mail schreiben“ (components/lead-mail.tsx), später auch für Angebot und Vorschläge.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Copy, Download, ExternalLink, Loader2, Mail, Share2 } from "lucide-react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { mailtoLink, ohneSignatur } from "@/lib/mail/mailto";

export type MailWegAnhang = { name: string; url: string };

export function MailWege({
  appVersand,
  senden,
  pending = false,
  disabled = false,
  mail,
  signatur,
  anhaenge = [],
  onGesendet,
  sendenLabel = "Über die App senden",
}: {
  /** Über die App senden möglich (Postfach oder Versanddomain, E-Mail-Funktionen an) */
  appVersand: boolean;
  senden: () => void;
  pending?: boolean;
  /** Pflichtangaben fehlen (gilt für alle Wege) */
  disabled?: boolean;
  mail: { to: string; subject: string; text: string };
  /** Signatur im Text, entfällt bei mailto und Kopieren */
  signatur?: string | null;
  anhaenge?: MailWegAnhang[];
  /** „Gesendet?“ → Ja */
  onGesendet: () => Promise<void> | void;
  sendenLabel?: string;
}) {
  const toast = useToast();
  // extern: mailto oder Kopieren gewählt; frage: „Gesendet?“ sichtbar (beim Zurückkehren)
  const [extern, setExtern] = useState(false);
  const [frage, setFrage] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const weg = useRef(false);
  // Handy mit Teilen-Menü für Dateien: „PDF teilen“, sonst „PDF herunterladen“
  const teilen = useSyncExternalStore(keinAbo, kannDateienTeilen, () => false);

  // Zurück aus dem Mailprogramm bzw. aus einer anderen App: „Gesendet?“ fragen
  useEffect(() => {
    if (!extern) return;
    const hidden = () => {
      if (document.visibilityState === "hidden") weg.current = true;
    };
    const blur = () => {
      weg.current = true;
    };
    const back = () => {
      if (weg.current && document.visibilityState === "visible") {
        weg.current = false;
        setFrage(true);
      }
    };
    document.addEventListener("visibilitychange", hidden);
    document.addEventListener("visibilitychange", back);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", back);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", back);
    };
  }, [extern]);

  const text = ohneSignatur(mail.text, signatur);

  const kopiere = async (v: string) => {
    try {
      await navigator.clipboard.writeText(v);
      return true;
    } catch {
      return false;
    }
  };

  const oeffnen = async () => {
    const { href, gekuerzt } = mailtoLink({ to: mail.to, subject: mail.subject, body: text });
    if (gekuerzt) {
      const ok = await kopiere(text);
      toast.show({ message: ok ? "Text ist lang: in die Zwischenablage kopiert. Im Mailprogramm einfügen." : "Text ist zu lang für das Mailprogramm. Bitte mit „Text kopieren“ übernehmen.", tone: ok ? undefined : "error" });
    }
    weg.current = false;
    setExtern(true);
    setFrage(false);
    window.location.href = href;
  };

  const kopieren = async () => {
    const ok = await kopiere(text);
    if (!ok) return toast.show({ message: "Kopieren hat nicht geklappt. Bitte den Text markieren und kopieren.", tone: "error" });
    toast.show({ message: "Text kopiert" });
    weg.current = false;
    setExtern(true);
    setFrage(false);
  };

  const ja = async () => {
    setSpeichert(true);
    try {
      await onGesendet();
      setFrage(false);
      setExtern(false);
    } finally {
      setSpeichert(false);
    }
  };

  const nebenKnopf = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[color:var(--brand)] hover:bg-[color:var(--brand-soft)] disabled:opacity-50";

  return (
    <div className="space-y-2" data-mail-wege>
      {frage ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--brand)]/40 bg-[color:var(--brand-soft)] px-3 py-2" data-mail-gesendet-frage>
          <span className="min-w-0 flex-1 text-sm font-medium">Haben Sie die E-Mail gesendet?</span>
          <Button variant="primary" size="sm" onClick={ja} disabled={speichert} data-mail-gesendet-ja>
            {speichert ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Ja
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setFrage(false)} disabled={speichert} data-mail-gesendet-nein>
            Nein
          </Button>
        </div>
      ) : null}

      {appVersand ? (
        <Button variant="primary" size="md" className="w-full" disabled={pending || disabled || !mail.to.trim()} onClick={senden} data-lead-mail-send>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          {sendenLabel}
        </Button>
      ) : (
        <Button variant="primary" size="md" className="w-full" disabled={disabled} onClick={oeffnen} data-mail-mailto>
          <ExternalLink className="h-4 w-4" />
          Im eigenen Mailprogramm öffnen
        </Button>
      )}
      <div className="flex flex-wrap justify-center gap-x-2">
        {appVersand ? (
          <button type="button" className={nebenKnopf} disabled={disabled} onClick={oeffnen} data-mail-mailto>
            <ExternalLink className="h-4 w-4" /> Im Mailprogramm öffnen
          </button>
        ) : null}
        <button type="button" className={nebenKnopf} disabled={disabled} onClick={kopieren} data-mail-kopieren>
          <Copy className="h-4 w-4" /> Text kopieren
        </button>
        {extern && !frage ? (
          <button type="button" className={nebenKnopf} onClick={() => setFrage(true)} data-mail-gesendet-oeffnen>
            <Check className="h-4 w-4" /> Gesendet?
          </button>
        ) : null}
      </div>
      {anhaenge.length && (extern || !appVersand) ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[color:var(--muted)]" data-mail-anhaenge-extern>
          <span>Anhang selbst hinzufügen:</span>
          {anhaenge.map((a) =>
            teilen ? (
              <button key={a.url} type="button" className={`${nebenKnopf} min-h-8 px-2 text-xs`} onClick={() => teileDatei(a)} data-mail-pdf-teilen>
                <Share2 className="h-3.5 w-3.5" /> PDF teilen
              </button>
            ) : (
              <a key={a.url} href={a.url} download={a.name} className={`${nebenKnopf} min-h-8 px-2 text-xs`} data-mail-pdf-laden>
                <Download className="h-3.5 w-3.5" /> {anhaenge.length > 1 ? a.name : "PDF herunterladen"}
              </a>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

const keinAbo = () => () => {};
let teilenCache: boolean | null = null;
function kannDateienTeilen(): boolean {
  if (teilenCache !== null) return teilenCache;
  try {
    const probe = new File([new Blob(["x"])], "x.pdf", { type: "application/pdf" });
    teilenCache = window.matchMedia("(pointer: coarse)").matches && !!navigator.canShare?.({ files: [probe] });
  } catch {
    teilenCache = false;
  }
  return teilenCache;
}

/** Datei über das Teilen-Menü des Handys (z. B. in die Mail-App). */
async function teileDatei(a: MailWegAnhang): Promise<void> {
  try {
    const res = await fetch(a.url);
    const blob = await res.blob();
    const file = new File([blob], a.name, { type: blob.type || "application/pdf" });
    await navigator.share({ files: [file], title: a.name });
  } catch {
    window.open(a.url, "_blank", "noopener");
  }
}
