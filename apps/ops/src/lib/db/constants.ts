import type {
  PipelineStage,
  PricingModel,
  TaskPriority,
  TaskStatus,
  WorkspaceRole,
} from "./types";

/** Board columns, left to right. The order here is the order on screen. */
export const PIPELINE_STAGES: ReadonlyArray<{ id: PipelineStage; label: string }> = [
  { id: "inquiry", label: "Inquiry" },
  { id: "proposal_sent", label: "Proposal sent" },
  { id: "confirmed", label: "Confirmed" },
  { id: "prep", label: "Prep" },
  { id: "live", label: "Live" },
  { id: "wrap_up", label: "Wrap-up" },
  { id: "invoiced_closed", label: "Invoiced / Closed" },
];

export const PRICING_MODELS: ReadonlyArray<{ id: PricingModel; label: string }> = [
  { id: "per_player", label: "Per player" },
  { id: "annual", label: "Annual" },
  { id: "promo_discount", label: "Promo discount" },
];

/** Task board columns, left to right. */
export const TASK_STATUSES: ReadonlyArray<{ id: TaskStatus; label: string }> = [
  { id: "todo", label: "To do" },
  { id: "in_progress", label: "In progress" },
  { id: "blocked", label: "Blocked" },
  { id: "done", label: "Done" },
];

export const TASK_PRIORITIES: ReadonlyArray<{ id: TaskPriority; label: string }> = [
  { id: "low", label: "Low" },
  { id: "normal", label: "Normal" },
  { id: "high", label: "High" },
  { id: "urgent", label: "Urgent" },
];

export const WORKSPACE_ROLES: ReadonlyArray<{ id: WorkspaceRole; label: string; summary: string }> =
  [
    { id: "owner", label: "Owner", summary: "Everything, including members and roles." },
    { id: "partner", label: "Partner", summary: "All content, including deleting it." },
    { id: "member", label: "Member", summary: "Read and write; cannot delete." },
  ];

/** Realtime channel names. Always opened as private channels. See docs/workspace/SPEC.md. */
export const channels = {
  doc: (docId: string) => `ws:doc:${docId}`,
  board: "ws:board",
  tasks: "ws:tasks",
} as const;

/**
 * Gap below which a fractional `position` is rebalanced. A move writes the midpoint of its new
 * neighbours; when two neighbours get closer than this, the whole column is renumbered 1000 apart.
 */
export const POSITION_MIN_GAP = 1e-6;
export const POSITION_STEP = 1000;
