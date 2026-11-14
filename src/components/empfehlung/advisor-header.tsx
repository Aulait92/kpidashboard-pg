// Kopfzeile der Empfehlungsseiten im Namen des Vermittlers statt performancegrowth (Ole, 14.11.2026):
// Kunden von Allianz-Vertretern und Maklern sollen die Seite als Seite ihres Beraters erleben.

export function advisorInitials(name: string): string {
  return (
    name
      .replace(/^Allianz\s+/i, "")
      .split(/\s+/)
      .filter((w) => /\p{L}/u.test(w))
      .map((w) => w.match(/\p{L}/u)?.[0] ?? "")
      .slice(0, 2)
      .join("")
      .toUpperCase() || "•"
  );
}

export function AdvisorHeader({ name, label }: { name: string; label?: string }) {
  return (
    <div className="mb-4 flex items-center gap-3" data-advisor-header>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-[color:var(--brand-dark)] shadow-[var(--shadow-sm)] ring-1 ring-[color:var(--border)]">
        {advisorInitials(name)}
      </span>
      <div className="min-w-0">
        {label ? <div className="text-xs text-[color:var(--muted)]">{label}</div> : null}
        <div className="truncate text-base font-semibold leading-tight">{name}</div>
      </div>
    </div>
  );
}
