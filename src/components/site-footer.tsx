// Globaler Footer mit Pflicht-Links (Impressum, Datenschutz). Externe
// Performance-Growth-Seiten, target=_blank damit der Buyer nicht aus dem
// Dashboard rausgerissen wird. Bewusst minimalistisch, nur eine Zeile —
// Wir haben sonst kein Footer-Inventar.
export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-[color:var(--border)] px-4 py-4 text-center text-xs text-[color:var(--muted)] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1600px] flex-col items-center justify-center gap-x-4 gap-y-1 sm:flex-row">
        <span>© performancegrowth</span>
        <a
          href="https://performancegrowth.de/impressum"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[color:var(--brand)] hover:underline"
        >
          Impressum
        </a>
        <a
          href="https://performancegrowth.de/datenschutz"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[color:var(--brand)] hover:underline"
        >
          Datenschutz
        </a>
      </div>
    </footer>
  );
}
