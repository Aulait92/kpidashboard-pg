"use client";

// Link auf einen Aufklapp-Bereich weiter unten (z. B. „Warum Leads verloren gehen“): öffnet ihn und scrollt hin.

export function DetailsLink({ ziel, children }: { ziel: string; children: React.ReactNode }) {
  return (
    <a
      href={`#${ziel}`}
      className="font-semibold text-[color:var(--brand)] hover:underline"
      onClick={(e) => {
        const el = document.getElementById(ziel);
        if (!(el instanceof HTMLDetailsElement)) return;
        e.preventDefault();
        el.open = true;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
    >
      {children}
    </a>
  );
}
