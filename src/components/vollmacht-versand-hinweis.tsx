// Hinweis auf „Heute“ (Ole, 18.11.2026): Makler, die noch nicht entschieden haben, wer die Maklervollmacht schickt
// (Customer.vollmachtVersand null). Nur Inhaber, nicht in der Vorschau; verschwindet mit der Antwort.

import { FileSignature } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { vollmachtVersandStand } from "@/lib/maklervollmacht/server";
import { VollmachtVersandWahl } from "@/components/vollmacht-versand-wahl";

export async function VollmachtVersandHinweis({ ctx }: { ctx: { customerId: string; teamRole?: string | null; preview?: boolean } }) {
  if (ctx.preview || ctx.teamRole === "advisor") return null;
  const s = await vollmachtVersandStand(ctx.customerId).catch(() => null);
  if (!s?.makler || s.versand) return null;
  return (
    <div data-vv-versand-hinweis>
    <Card id="vollmacht-versand">
      <CardHeader title="Maklervollmacht" icon={FileSignature} />
      <div className="px-5 pb-5 pt-1">
        <p className="mb-3 text-[15px] font-medium">Bitte kurz entscheiden: Wer schickt sie Ihren Kunden?</p>
        <VollmachtVersandWahl wert={null} darf />
      </div>
    </Card>
    </div>
  );
}
