import { cookies } from "next/headers";

// Lightweight identity: the user picks a role and types their name on entry.
// Stored in a cookie so every recorded action is attributed (audit trail)
// without the overhead of full authentication for this internal MVP.

export const ROLES = ["NURSE", "DOCTOR", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

const COOKIE = "qc_session";

export interface Session {
  role: Role;
  name: string;
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function getSession(): Session | null {
  const raw = cookies().get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (parsed.role && isRole(parsed.role) && typeof parsed.name === "string") {
      return { role: parsed.role, name: parsed.name };
    }
  } catch {
    // fall through
  }
  return null;
}

export function setSession(session: Session): void {
  cookies().set(COOKIE, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12, // a 12-hour shift
  });
}

export function clearSession(): void {
  cookies().delete(COOKIE);
}

export const ROLE_LABELS: Record<Role, string> = {
  NURSE: "Nurse",
  DOCTOR: "Doctor",
  ADMIN: "Admin",
};
