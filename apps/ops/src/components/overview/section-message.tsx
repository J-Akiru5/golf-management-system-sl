import type { ReactNode } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

/** A section that could not load. Plain words, no data, so nothing on it can look real. */
export function SectionMessage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardBody>
        <p className="hint">{children}</p>
      </CardBody>
    </Card>
  );
}
