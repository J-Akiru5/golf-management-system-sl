import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

/** Overline, heading and one line of context, with the page's actions on the right. */
export function PageHeader({
  overline,
  title,
  crumbs,
  children,
  actions,
  className,
}: {
  overline: ReactNode;
  title: ReactNode;
  /** Contextual trail, e.g. Tournaments / Registration desk. The last item is the current page. */
  crumbs?: { label: string; href?: string }[];
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
      <div className="grid min-w-0 gap-1.5">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-muted">
              {crumbs.map((c, i) => (
                <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
                  {i > 0 && <span aria-hidden="true">/</span>}
                  {c.href ? (
                    <Link href={c.href} className="text-ink-muted no-underline hover:underline">
                      {c.label}
                    </Link>
                  ) : (
                    <span aria-current="page">{c.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <p className="overline">{overline}</p>
        <h1>{title}</h1>
        {children && <div className="text-ink-muted">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A titled card section with a small Lucide icon, used on Setup, Import and the profile. */
export function SectionCard({
  icon,
  title,
  subtitle,
  action,
  id,
  className,
  children,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  id: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={cn("card grid gap-4 sm:p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {icon && (
            <span
              className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-fairway-soft text-fairway [&_svg]:size-[18px]"
              aria-hidden="true"
            >
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h2 id={id} className="text-[18px] leading-6">
              {title}
            </h2>
            {subtitle && <p className="hint mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
