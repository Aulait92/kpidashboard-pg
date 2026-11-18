// Server-Hülle der Freischaltkarte (lib/policen/freischaltung.ts): nur Inhaber, nur solange sie fällig ist.
import { ladeFreischaltung } from "@/lib/policen/freischaltung";
import { PolicenFreischaltung } from "@/components/policen-freischaltung";

type Ctx = { customerId: string; userId: string | null; preview: boolean; teamRole?: string | null; demo?: boolean };

export async function PolicenFreischaltungKarte({ ctx, ort, className }: { ctx: Ctx; ort: "karte" | "einstellungen"; className?: string }) {
  const f = await ladeFreischaltung(ctx).catch(() => null);
  if (!f || (ort === "karte" && !f.karte)) return null;
  return (
    <div className={className}>
      <PolicenFreischaltung f={f} ort={ort} />
    </div>
  );
}
