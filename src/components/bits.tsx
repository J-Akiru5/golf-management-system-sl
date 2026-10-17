import { initials } from "@/lib/format";
import type { RegistrationStatus } from "@/lib/routing";

const LABEL: Record<RegistrationStatus, string> = {
  ok: "Ready",
  needs_review: "Needs review",
  ineligible: "Not eligible",
};
const TONE: Record<RegistrationStatus, string> = {
  ok: "ok",
  needs_review: "warn",
  ineligible: "bad",
};

export function StatusPill({ status }: { status: RegistrationStatus }) {
  return <span className={`pill ${TONE[status]}`}>{LABEL[status]}</span>;
}

export function Avatar({ name, photo }: { name: string; photo?: string }) {
  return (
    <span className="avatar" aria-hidden="true">
      {photo ? <img src={photo} alt="" /> : initials(name)}
    </span>
  );
}
