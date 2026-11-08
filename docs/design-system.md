# Designsystem – Kundenbereich (CRM)

Ziel: Jede Seite fühlt sich gleich an. Neue Oberflächen werden **nur** aus den
Bausteinen in `src/components/ui/` gebaut – keine Einzel-Klassen für Buttons,
Karten oder Chips.

## Grundsätze
1. **Eine Hauptaktion pro Zeile/Karte.** Primär-Button (blau) nur für das, was
   der Nutzer jetzt tun soll (z. B. „Anrufen"). Alles andere `secondary`/`ghost`
   oder in ein Menü.
2. **Sofortige Rückmeldung.** Aktionen wirken sofort (Eintrag verschwindet),
   bestätigt durch einen Toast – wenn möglich mit „Rückgängig". Keine
   Browser-`alert()`s, kein kompletter Seiten-Neuaufbau.
3. **Nichts Leeres.** Jede Liste hat einen `EmptyState`, jede Seite beim Laden
   ein `Skeleton`.
4. **Icons nur aus `lucide-react`.** Keine Emojis in der Oberfläche.
5. **Deutsch, kurz, in Du-Form.** Verben auf Buttons („Anrufen", „Termin
   buchen"), keine Fachbegriffe/Anglizismen.

## Tokens (`src/app/globals.css`)
| Token | Wert | Verwendung |
|---|---|---|
| `--radius-sm` / `-md` / `-lg` | 8 / 12 / 16 px | Buttons·Inputs / Menüs·Toasts / Karten |
| `--shadow-sm` / `-md` / `-lg` | | Buttons / Karten / schwebende Elemente |
| `--surface`, `--surface-sunken` | weiß / #f7f9fc | Karten / Hover, Leerflächen |
| `--border`, `--border-strong` | | Standard / Hover |
| `--brand` | #2563eb | Primäraktion, aktive Navigation |

**Typografie:** Seitentitel `text-2xl font-semibold`, Kartentitel
`text-[15px] font-semibold`, Fließtext `text-sm`, Meta `text-xs text-muted`.
**Abstände:** Karten-Innenabstand `px-5 py-3.5`, zwischen Karten `space-y-6`.

## Bausteine
- `Button` / `ButtonLink` / `buttonClass()` – Varianten `primary`,
  `secondary`, `ghost`, `danger`; Größen `sm` (32 px), `md` (40 px).
- `Card` + `CardHeader` (Titel, Zähler, Icon, Hinweis/Aktionen).
- `Badge` – Töne `neutral`, `brand`, `success`, `warning`, `danger`, `info`.
  Status-Chips immer über `statusToneClass()` (gleiche Farbe je Phase überall).
- `EmptyState`, `Skeleton`, `PageSkeleton`.
- `useToast().show({ message, actionLabel, onAction })` – Rückmeldung/Undo.
- Seitenrahmen: `BuyerShell` + `PageHeader` (`src/components/buyer-shell.tsx`).

## Status-Farben
Neuer Lead grau · Nicht erreicht orange · Im Gespräch hellblau · Termin
vereinbart blau · Angebot violett · Abschluss grün · Kein Interesse rot.
