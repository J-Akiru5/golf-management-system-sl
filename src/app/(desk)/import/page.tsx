"use client";

import Link from "next/link";
import { useState } from "react";
import { RegistrationImport } from "@/components/import/RegistrationImport";
import { NeedsTournament } from "@/components/NeedsTournament";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useDesk } from "@/lib/store/desk-store";
import { HandicapImport } from "./HandicapImport";

type Tab = "registrations" | "handicaps";

export default function ImportPage() {
  const { tournament, status } = useDesk();
  // The registration import needs a connected project; in the demo the handicap CSV is the only
  // import that can be exercised, so that is the tab the page opens on.
  const [tab, setTab] = useState<Tab>(status === "demo" ? "handicaps" : "registrations");

  if (!tournament) return <NeedsTournament what="Imports" />;

  return (
    <div className="grid gap-6">
      <PageHeader
        overline="Data in"
        title="Imports"
        crumbs={[{ label: tournament.name, href: "/tournaments" }, { label: "Imports" }]}
        actions={
          <Button variant="secondary" asChild>
            <Link href="/register">Open the registration desk</Link>
          </Button>
        }
      >
        Bring the club&apos;s registration workbook or an NGAP handicap export in. The server
        validates every row, shows what it will write, and reads the result back before it reports
        success.
      </PageHeader>

      <div className="seg" role="tablist" aria-label="Import type">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "registrations"}
          aria-pressed={tab === "registrations"}
          onClick={() => setTab("registrations")}
        >
          Registration workbook
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "handicaps"}
          aria-pressed={tab === "handicaps"}
          onClick={() => setTab("handicaps")}
        >
          Handicap indices
        </button>
      </div>

      {tab === "registrations" ? <RegistrationImport /> : <HandicapImport />}
    </div>
  );
}
