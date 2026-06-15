import Link from "next/link";
import clsx from "clsx";
import { exitSession } from "@/app/actions";
import { ROLE_LABELS, type Role } from "@/lib/session";

const NAV: { href: string; label: string; roles: Role[] }[] = [
  { href: "/nurse", label: "Nurse rounds", roles: ["NURSE"] },
  { href: "/doctor", label: "Doctor rounds", roles: ["DOCTOR"] },
  { href: "/admin", label: "Admin", roles: ["ADMIN"] },
  { href: "/dashboard", label: "Quality dashboard", roles: ["NURSE", "DOCTOR", "ADMIN"] },
];

export function AppHeader({
  role,
  name,
  active,
}: {
  role: Role;
  name: string;
  active: string;
}) {
  const links = NAV.filter((n) => n.roles.includes(role));
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href={`/${role.toLowerCase()}`} className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-600 text-sm font-bold text-white">
            Q
          </span>
          <span className="font-semibold">Quarantine Care</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {links.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={clsx(
                "rounded-md px-3 py-1.5 font-medium",
                active === n.href
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-slate-500">
            {ROLE_LABELS[role]} · <span className="font-medium text-slate-700">{name}</span>
          </span>
          <form action={exitSession}>
            <button type="submit" className="text-slate-500 hover:text-slate-900">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
