"use client";

import { FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ExportFormat = "xlsx" | "pdf";

export interface ExportBarProps {
  /** What the file will hold, in words: "Start sheet · Day 3". Shown so the scope is never a guess. */
  scopeLabel: string;
  busy: ExportFormat | null;
  disabled?: boolean;
  disabledReason?: string;
  /** Scorecards are a card layout, so they have no spreadsheet form. */
  excelAvailable?: boolean;
  error?: string;
  onExport: (format: ExportFormat) => void;
}

/** Download buttons for the sheet on screen, for the day the selector shows. */
export function ExportBar({
  scopeLabel,
  busy,
  disabled = false,
  disabledReason,
  excelAvailable = true,
  error,
  onExport,
}: ExportBarProps) {
  const off = disabled || busy !== null;
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <span className="overline !text-[10px]">Download</span>
      {excelAvailable && (
        <Button
          variant="secondary"
          className="min-h-11 md:min-h-0"
          disabled={off}
          title={disabled ? disabledReason : `Excel workbook: ${scopeLabel}`}
          onClick={() => onExport("xlsx")}
        >
          <FileSpreadsheet aria-hidden="true" /> {busy === "xlsx" ? "Preparing…" : "Excel"}
        </Button>
      )}
      <Button
        variant="secondary"
        className="min-h-11 md:min-h-0"
        disabled={off}
        title={disabled ? disabledReason : `PDF: ${scopeLabel}`}
        onClick={() => onExport("pdf")}
      >
        <FileText aria-hidden="true" /> {busy === "pdf" ? "Preparing…" : "PDF"}
      </Button>
      <span className="hint" aria-live="polite">
        {disabled && disabledReason ? disabledReason : scopeLabel}
      </span>
      {error && (
        <span className="notice bad text-[13px]" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
