// Server-Hülle der Freischaltkarte (lib/policen/freischaltung.ts): nur Inhaber, nur solange sie fällig ist.
import type { ReactNode } from "react";
import { ladeFreischaltung } from "@/lib/policen/freischaltung";
import { PolicenFreischaltung } from "@/components/policen-freischaltung";

type Ctx = {
  customerId: string;
  userId: string | null;
  preview: boolean;
  teamRole?: string | null;
  demo?: boolean;
};

export async function PolicenFreischaltungKarte({
  ctx,
  ort,
  className,
  ohneKopf,
  leer,
}: {
  ctx: Ctx;
  ort: "karte" | "einstellungen";
  className?: string;
  ohneKopf?: boolean;
  /** Ersatz, wenn nichts freizuschalten ist bzw. hier nicht geht (Einrichtung: kein leerer Schritt, Ole 26.11.2026) */
  leer?: ReactNode;
}) {
  const f = await ladeFreischaltung(ctx).catch(() => null);
  if (!f || (ort === "karte" && !f.karte)) return leer ?? null;
  return (
    <div className={className}>
      <PolicenFreischaltung f={f} ort={ort} ohneKopf={ohneKopf} />
    </div>
  );
}
