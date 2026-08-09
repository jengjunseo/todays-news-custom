import { redirect } from "next/navigation";

import { hasValidSession } from "@/lib/auth/session";

export async function requirePageSession() {
  if (!(await hasValidSession())) redirect("/login");
}
