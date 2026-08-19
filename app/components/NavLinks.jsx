"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLinks({ links }) {
  const pathname = usePathname();
  return (
    <div className="flex items-center gap-3 overflow-x-auto text-xs whitespace-nowrap">
      {links.map(({ href, label }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "font-semibold text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
