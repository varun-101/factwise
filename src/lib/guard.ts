import { redirect } from "next/navigation";
import { getSession, type Role, type Session } from "./session";

/** Require a signed-in session with one of `roles`; otherwise redirect. */
export function requirePage(...roles: Role[]): Session {
  const session = getSession();
  if (!session) redirect("/");
  if (roles.length && !roles.includes(session.role)) {
    redirect(`/${session.role.toLowerCase()}`);
  }
  return session;
}
