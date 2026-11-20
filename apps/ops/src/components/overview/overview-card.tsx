import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The frame every overview section uses: a raised card, a title, one quiet line of description and
 * a link to the full screen. No accent bar, no gradient, no shadow stack.
 */
export function OverviewCard({
  title,
  description,
  href,
  linkLabel,
  children,
}: {
  title: string;
  description: string;
  href: string;
  linkLabel: string;
  children: ReactNode;
}) {
  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Link href={href} className="shrink-0 text-sm font-semibold">
          {linkLabel}
        </Link>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">{children}</CardBody>
    </Card>
  );
}
