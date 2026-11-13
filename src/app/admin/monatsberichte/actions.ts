"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAuth } from "@/lib/vertrieb/auth";
import { callInstead, runMonthlyReports, saveReportSettings, sendReport, setCustomerReportsOff, skipReport } from "@/lib/monatsbericht/server";
import { reportError } from "@/lib/monitoring";

export type ReportActionState = { ok?: boolean; error?: string; message?: string };

async function actor() {
  const s = await requireAuth();
  return { id: s.userId, email: s.email, role: s.role };
}

const done = (id?: string) => {
  revalidatePath("/admin/monatsberichte");
  if (id) revalidatePath(`/admin/monatsberichte/${id}`);
};

/** „So senden“ bzw. „Bearbeiten und senden“ (mit geänderten Absätzen). */
export async function sendReportAction(_prev: ReportActionState, fd: FormData): Promise<ReportActionState> {
  const a = await actor();
  const id = String(fd.get("id") ?? "");
  const edited = fd.get("edited") === "1";
  const subject = String(fd.get("subject") ?? "").trim();
  const paragraphs = String(fd.get("body") ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (edited && (!subject || !paragraphs.length)) return { error: "Betreff und Text dürfen nicht leer sein." };
  const res = await sendReport(id, a, edited ? { subject, paragraphs } : undefined);
  if (!res.ok) return { error: res.error };
  done(id);
  return { ok: true, message: "Gesendet." };
}

export async function callInsteadAction(_prev: ReportActionState, fd: FormData): Promise<ReportActionState> {
  const a = await actor();
  const id = String(fd.get("id") ?? "");
  const res = await callInstead(id, a);
  if (!res.ok) return { error: res.error };
  done(id);
  return { ok: true, message: "Nicht gesendet – Anruf-Aufgabe liegt in Heute." };
}

export async function skipReportAction(_prev: ReportActionState, fd: FormData): Promise<ReportActionState> {
  const a = await actor();
  const id = String(fd.get("id") ?? "");
  const res = await skipReport(id, a);
  if (!res.ok) return { error: res.error };
  done(id);
  return { ok: true, message: "Für diesen Monat ausgesetzt." };
}

export async function toggleCustomerReportsAction(_prev: ReportActionState, fd: FormData): Promise<ReportActionState> {
  const a = await actor();
  const customerId = String(fd.get("customerId") ?? "");
  const off = fd.get("off") === "1";
  await setCustomerReportsOff(customerId, off, a);
  done(String(fd.get("id") ?? "") || undefined);
  return { ok: true, message: off ? "Dieser Kunde bekommt keine Monatsberichte mehr." : "Monatsberichte für diesen Kunden wieder an." };
}

/** Jetzt erzeugen (Vormonat, fehlende Kunden) – läuft im Hintergrund. */
export async function generateNowAction(_prev: ReportActionState, fd: FormData): Promise<ReportActionState> {
  await actor();
  const month = String(fd.get("month") ?? "") || undefined;
  if (!process.env.ANTHROPIC_API_KEY) return { error: "ANTHROPIC_API_KEY fehlt – Berichte können nicht geschrieben werden." };
  after(() => runMonthlyReports(new Date(), { month, limit: 30 }).then(() => revalidatePath("/admin/monatsberichte")).catch((e: unknown) => reportError(e, "bericht-manuell")));
  return { ok: true, message: "Läuft im Hintergrund – Seite in 1–2 Minuten neu laden." };
}

export async function saveReportSettingsAction(_prev: ReportActionState, fd: FormData): Promise<ReportActionState> {
  const a = await actor();
  const n = (k: string) => {
    const v = String(fd.get(k) ?? "").trim().replace(",", ".");
    return v === "" ? undefined : Number(v);
  };
  const target = String(fd.get("targetCpl") ?? "").trim();
  await saveReportSettings(
    {
      autoSendGood: fd.get("autoSendGood") === "on",
      senderName: String(fd.get("senderName") ?? ""),
      goodLeadsPct: n("goodLeadsPct"),
      weakLeadsPct: n("weakLeadsPct"),
      weakCplPct: n("weakCplPct"),
      weakNoMeetingLeads: n("weakNoMeetingLeads"),
      minResultPct: n("minResultPct"),
      minActiveDays: n("minActiveDays"),
      targetCpl: target === "" ? null : Number(target.replace(",", ".")),
      bookingUrl: String(fd.get("bookingUrl") ?? "").trim() || null,
    },
    a,
  );
  revalidatePath("/admin/einstellungen/monatsberichte");
  return { ok: true, message: "Gespeichert." };
}
