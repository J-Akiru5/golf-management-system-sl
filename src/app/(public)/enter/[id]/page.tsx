"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { RegistrationForm } from "@/components/public/RegistrationForm";
import {
  loadRegistrationForm,
  type RegistrationFormConfig,
  submitRegistration,
} from "@/lib/data/supabase/public-registration";
import { useI18n } from "@/lib/i18n/context";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Public entry form. No login: the reads and the write go through SECURITY DEFINER functions, and
 * an entry always lands as Needs review for the desk.
 */
export default function EnterTournament() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const [config, setConfig] = useState<RegistrationFormConfig | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error" | "demo">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setState("demo");
      return;
    }
    let active = true;
    void (async () => {
      try {
        const loaded = await loadRegistrationForm(createSupabaseBrowserClient(), id);
        if (!active) return;
        if (!loaded) {
          setState("missing");
          return;
        }
        setConfig(loaded);
        setState("ready");
      } catch (loadError) {
        if (!active) return;
        setState("error");
        setError(loadError instanceof Error ? loadError.message : null);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <div className="public">
      <header className="public-head">
        <p className="overline mt-3 !text-gold">{t("enter.overline")}</p>
        <h1 className="font-serif text-[28px] leading-8 font-semibold !text-on-forest sm:text-[44px] sm:leading-[48px]">
          {config?.name ?? t("enter.title")}
        </h1>
        {config && config.dates.length > 0 && (
          <p className="text-on-forest-muted">
            {config.dates
              .map((date) =>
                new Date(`${date}T00:00:00`).toLocaleDateString("en-PH", { dateStyle: "long" }),
              )
              .join(" · ")}
          </p>
        )}
      </header>

      {state === "loading" && <p role="status">{t("enter.loading")}</p>}

      {state === "demo" && (
        <div className="notice" role="status">
          <b>{t("enter.demoTitle")}</b> {t("enter.demoBody")}
        </div>
      )}

      {state === "missing" && (
        <div className="notice" role="status">
          <b>{t("enter.missingTitle")}</b> {t("enter.missingBody")}
        </div>
      )}

      {state === "error" && (
        <div className="notice bad" role="alert">
          <b>{t("enter.errorTitle")}</b> {error ?? ""}
        </div>
      )}

      {state === "ready" && config && !config.isOpen && (
        <div className="notice" role="status">
          <b>{t("enter.closedTitle")}</b>
          {config.cutOffDate ? t("enter.closedDeadline", { date: config.cutOffDate }) : ""}{" "}
          {t("enter.closedBody")}
        </div>
      )}

      {state === "ready" && config && config.isOpen && (
        <RegistrationForm
          config={config}
          onSubmit={async (player, answers) => {
            const result = await submitRegistration(
              createSupabaseBrowserClient(),
              config.tournamentId,
              player,
              answers,
            );
            if (!result.ok) throw new Error(result.message);
            return result.message;
          }}
        />
      )}
    </div>
  );
}
