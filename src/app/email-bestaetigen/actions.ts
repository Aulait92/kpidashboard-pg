"use server";

import { redirect } from "next/navigation";
import { confirmEmailChange } from "@/lib/email-aendern";

/** Klick auf „Neue Adresse bestätigen“ (erst hier wird der Token verbraucht, nicht beim Öffnen des Links). */
export async function confirmEmailAction(fd: FormData): Promise<void> {
  const res = await confirmEmailChange(String(fd.get("token") ?? ""));
  redirect(`/login?hinweis=${res.ok ? "email-geaendert" : "email-link-ungueltig"}`);
}
