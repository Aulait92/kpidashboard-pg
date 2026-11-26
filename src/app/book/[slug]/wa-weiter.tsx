// Block „Weiter auf WhatsApp“ auf der Erfolgsansicht der Buchungsseite (Ole, 26.11.2026), Splittest wa_weiter_knopf
// (lib/experimente.ts, Ziel wa_weiter_klick). Fassung a = bisher (Kartenstil, Primärknopf „Weiter auf WhatsApp“),
// Fassung b = Knopf in WhatsApp-Optik mit Logo, Mini-Fortschritt, konkreter Nutzen, am Rechner zusätzlich ein QR-Code
// (gleiches Ziel über die Klick-Route). Rein, ohne Datenbank (Seite und Tests).

import { Check, Circle, MessageCircle } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { a, type Ansprache } from "@/lib/ansprache";
import type { Variante } from "@/lib/experimente";

/** WhatsApp-Grün für Fassung b: #008069 mit weißer Schrift, Kontrast 4,9 : 1 (#25D366 bzw. #1DA851 nur 2,0 bzw. 3,1). */
export const WA_GRUEN = "#008069";

/** WhatsApp-Logo als Glyph (Simple Icons, CC0), Farbe über currentColor. */
export function WhatsAppLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className} data-wa-logo>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

export type WaWeiterProps = {
  an: Ansprache;
  variante: Variante;
  /** Vermittler im Nominativ („Herr Schwarzkopf“ bzw. „Anid“) */
  person: string;
  /** Klick-Route /book/manage/<token>/whatsapp (zählt den Klick, leitet zu wa.me) */
  href: string;
  /** Fassung b: Komplettcheck mit „Ja“ beantwortet → Häkchen in der Fortschrittsliste */
  komplettcheck?: boolean;
  /** Fassung b, ab sm: QR-Code (Data-URL) mit der absoluten Klick-Route; null = Hinweis statt Code */
  qr?: string | null;
};

export function WaWeiterBlock(p: WaWeiterProps) {
  const { an, person } = p;
  if (p.variante !== "b") {
    return (
      <div className="mt-5 rounded-xl bg-[color:var(--brand-soft)] p-4" data-wa-weiter data-wa-fassung="a">
        <h2 className="text-[15px] font-semibold leading-snug">{a(an, "Dein Angebot schneller bekommen", "Ihr Angebot schneller bekommen")}</h2>
        <p className="mt-1 text-sm leading-relaxed">
          {a(
            an,
            `Beantworte jetzt ein paar kurze Fragen per WhatsApp, dann kann ${person} dein Angebot schon vorbereiten.`,
            `Beantworten Sie jetzt ein paar kurze Fragen per WhatsApp, dann kann ${person} Ihr Angebot schon vorbereiten.`,
          )}
        </p>
        {/* Über die eigene Route: Klick messen, dann weiter zu wa.me mit vorbefülltem Text */}
        <a href={p.href} className={buttonClass("primary", "md", "mt-3 h-12 w-full text-base")} data-wa-weiter-knopf>
          <MessageCircle className="h-5 w-5" /> Weiter auf WhatsApp
        </a>
      </div>
    );
  }
  const erledigt = ["Termin gebucht", ...(p.komplettcheck ? ["Komplettcheck"] : [])];
  return (
    <div className="mt-4 rounded-xl bg-[color:var(--brand-soft)] p-4" data-wa-weiter data-wa-fassung="b">
      <h2 className="text-[15px] font-semibold leading-snug">Noch ein Schritt</h2>
      <ul className="mt-2 space-y-1 text-sm" data-wa-fortschritt>
        {erledigt.map((t) => (
          <li key={t} className="flex items-center gap-2 text-[color:var(--muted)]">
            <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            <span>
              <span className="sr-only">Erledigt: </span>
              {t}
            </span>
          </li>
        ))}
        <li className="flex items-start gap-2">
          <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--muted)]" aria-hidden="true" />
          <span>
            <span className="sr-only">Offen: </span>
            <strong className="font-semibold">Angaben fürs Angebot</strong>
            <span className="block text-xs text-[color:var(--muted)]">1 Minute per WhatsApp</span>
          </span>
        </li>
      </ul>
      <p className="mt-2 text-sm leading-relaxed" data-wa-nutzen>
        {a(an, `Dann hat ${person} dein Angebot im Termin schon vorbereitet.`, `Dann hat ${person} Ihr Angebot im Termin schon vorbereitet.`)}
      </p>
      {/* Über die eigene Route: Klick messen, dann weiter zu wa.me mit vorbefülltem Text */}
      <a
        href={p.href}
        style={{ backgroundColor: WA_GRUEN }}
        className={buttonClass("primary", "md", "mt-3 h-auto min-h-12 w-full gap-2.5 whitespace-normal px-3 py-2 text-[15px] leading-tight text-white hover:brightness-90 focus-visible:ring-[#008069]")}
        data-wa-weiter-knopf
      >
        <WhatsAppLogo className="h-6 w-6 shrink-0" />
        {/* Am Handy zwei Zeilen: „(1 Minute)“ bricht als Ganzes um */}
        <span className="text-left">
          Jetzt Fragen beantworten <span className="whitespace-nowrap">(1 Minute)</span>
        </span>
      </a>
      <p className="mt-1.5 text-center text-xs text-[color:var(--muted)]" data-wa-hinweis>
        öffnet WhatsApp
      </p>
      {/* Am Rechner (ab sm): weiter am Handy, gleiche Klick-Route */}
      {p.qr ? (
        <div className="mt-3 hidden items-center gap-3 sm:flex" data-wa-qr>
          {/* eslint-disable-next-line @next/next/no-img-element -- Data-URL, kein Bild-Optimierer nötig */}
          <img src={p.qr} alt="QR-Code zu WhatsApp" width={88} height={88} className="rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white" />
          <span className="text-sm text-[color:var(--muted)]">Mit dem Handy scannen</span>
        </div>
      ) : (
        <p className="mt-3 hidden text-sm text-[color:var(--muted)] sm:block" data-wa-qr-text>
          Oder am Handy: Die Fragen kommen auch per WhatsApp.
        </p>
      )}
    </div>
  );
}
