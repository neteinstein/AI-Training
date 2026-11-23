"use client";

import type { ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** A navigation link that marks itself as the current page. */
export function NavLink({
  href,
  children,
  className,
  activeClassName = "text-primary font-semibold",
  onNavigate,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  activeClassName?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const target = href.split("#")[0];
  // A link to a section of the home page is never "the current page".
  const active = !href.includes("#") && (pathname === target || pathname.startsWith(`${target}/`));

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(className, active && activeClassName)}
    >
      {children}
    </Link>
  );
}
