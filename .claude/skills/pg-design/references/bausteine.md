# Bausteine und Tokens

Quelle der Wahrheit: `src/components/ui/` und `src/app/globals.css`. Bei Abweichung gilt der Code; dann diese Datei
und `docs/design-system.md` nachziehen.

## Tokens (CSS-Variablen in `globals.css`)

| Token | Wert | Wofür |
|---|---|---|
| `--brand` / `--brand-dark` / `--brand-soft` | #2563eb / #1d4ed8 / #e5edff | Hauptaktion, aktive Navigation, leichte Hervorhebung |
| `--foreground` / `--muted` | #0b1220 / #5b6883 | Text / Nebentext |
| `--background` | #f5f8ff | Seitenhintergrund |
| `--surface` / `--surface-sunken` | weiß / #f7f9fc | Karten / Hover, Leerflächen |
| `--border` / `--border-strong` | #e6ecf5 / #d6dee9 | Rahmen / Rahmen bei Hover |
| `--success` / `--warning` / `--danger` | #059669 / #d97706 / #e11d48 | Zustände |
| `--radius-sm` / `-md` / `-lg` | 8 / 12 / 16 px | Knöpfe, Eingaben / Menüs, Toasts / Karten |
| `--shadow-sm` / `-md` / `-lg` | | Knöpfe / Karten / schwebende Elemente |

In Tailwind so verwenden: `bg-[color:var(--brand)]`, `text-[color:var(--muted)]`, `rounded-[var(--radius-sm)]`,
`shadow-[var(--shadow-md)]`. Keine Hex-Werte im Code, keine neuen Farben.

**Schrift:** Geist (`--font-sans`). Seitentitel `text-2xl font-semibold`, Kartentitel `text-[15px] font-semibold`,
Fließtext `text-sm`, Meta `text-xs text-[color:var(--muted)]`. Zahlen in Spalten `tabular-nums`.
**Abstände:** Karten-Innenabstand `px-5 py-3.5`, zwischen Karten `space-y-6`.

## Bausteine (`src/components/ui/`)

| Baustein | Datei | Wofür |
|---|---|---|
| `Button`, `ButtonLink`, `buttonClass(variant, size)` | `index.tsx` | Varianten `primary` (nur Hauptaktion), `secondary`, `ghost`, `danger`; Größen `sm` (Handy 40 px, ab sm 32 px), `md` (40 px). Fokusring ist eingebaut. |
| `Card`, `CardHeader` | `index.tsx` | Karte mit Titel, Zähler, Icon, Hinweis, Aktionen |
| `Badge` | `index.tsx` | Töne `neutral`, `brand`, `success`, `warning`, `danger`, `info` |
| `statusToneClass(status)` | `src/lib/products.ts` | Farbe der Lead-Phase, überall gleich |
| `EmptyState` | `index.tsx` | Leere Liste mit nächster Handlung |
| `Skeleton`, `PageSkeleton` | `index.tsx` | Ladezustand |
| `useToast().show({ message, actionLabel, onAction })` | `toast.tsx` | Rückmeldung, „Rückgängig“ |
| `ActionMenu` | `menu.tsx` | Neben-Aktionen am Desktop (Aufklapp-Menü) |
| `Sheet`, `ActionSheet`, `TapRow` | `sheet.tsx` | Auswahlfenster: Handy von unten, Desktop mittig; für Neben-Aktionen einer Zeile |
| `FilterChips` | `filter-chips.tsx` | Suche plus Filter-Chips, wirkt sofort über URL-Parameter |
| `FileDrop` | `file-drop.tsx` | Datei hochladen (Ziehen oder Tippen) |
| `AutoSubmitSelect`, `CloseDetailsForm` | `auto-submit-select.tsx`, `close-details-on-submit.tsx` | Auswahl speichert sofort; aufgeklappten Bereich nach dem Speichern schließen |
| `BuyerShell`, `PageHeader` | `src/components/buyer-shell.tsx` | Seitenrahmen und Seitenkopf im Vermittlerbereich |

## Eingabefelder

Es gibt noch keinen gemeinsamen Eingabe-Baustein. Bis dahin diese Klassen (Handy 44 px und `text-base`, damit iOS nicht
zoomt):

```
mt-1 h-11 w-full min-w-0 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-base sm:h-10 sm:text-sm
```

Dazu immer `<label>` (oder `aria-label`), passender `type`/`inputMode` (`tel`, `email`, `numeric`), `autoComplete`,
bei E-Mail und Codes `spellCheck={false}`, Fehler direkt am Feld.

## Status-Farben der Lead-Phasen

Neuer Lead grau · Nicht erreicht orange · Im Gespräch hellblau · Termin vereinbart blau · Angebot violett ·
Abschluss grün · Kein Interesse rot. Immer über `statusToneClass()`.
