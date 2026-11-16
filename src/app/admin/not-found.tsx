import Link from "next/link";
import { buttonClass } from "@/components/ui";

// 404 im Admin (z. B. gelöschter Kunde oder Kontakt aus einem alten Link): nächster Schritt „Heute“
// statt „/“ (das ist im Admin das Lead-Dashboard). Menü und Suche bleiben sichtbar.
export default function AdminNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center px-4 py-16 text-center" data-admin-not-found>
      <p className="text-sm font-semibold text-[color:var(--brand)]">404</p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">Das gibt es nicht mehr</h1>
      <p className="mt-2 text-sm text-[color:var(--muted)]">Vielleicht gelöscht oder zusammengeführt. Über die Suche oben finden Sie Kunden und Kontakte.</p>
      <Link href="/admin/heute" className={buttonClass("primary", "md", "mt-6")}>
        Zu Heute
      </Link>
    </main>
  );
}
