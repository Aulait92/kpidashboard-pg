// Kundenlink abgelaufen oder ungültig (16.11.2026): Der Kunde sieht, warum, und was er tun kann, statt einer 404 auf Englisch.
// Ohne Token kennen wir die Ansprache nicht: Standard Sie.
export const metadata = { title: "Link abgelaufen", robots: { index: false, follow: false } };

export default function BeratungNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-16 text-center" data-kundenlink-abgelaufen>
      <h1 className="text-xl font-semibold tracking-tight">Dieser Link ist nicht mehr gültig</h1>
      <p className="mt-2 text-[15px] text-[color:var(--muted)]">
        Ihre Beratungsunterlagen sind aus Datenschutzgründen nur 14 Tage online. Ihr Berater schickt Ihnen gern einen neuen Link.
      </p>
    </main>
  );
}
