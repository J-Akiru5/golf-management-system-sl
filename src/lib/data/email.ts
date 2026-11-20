import type { EmailOutboxRow } from "@/lib/supabase/types";

export interface EmailOutboxMessage {
  id: string;
  tournamentId: string;
  registrationId: string | null;
  recipientEmail: string;
  recipientName: string;
  kind: "confirmation" | "reminder" | "custom" | "feedback_digest" | "feedback_alert";
  subject: string;
  body: string;
  status: "queued" | "sending" | "sent" | "failed" | "skipped";
  scheduledFor: string | null;
  sentAt: string | null;
  error: string | null;
  createdAt: string;
}

export interface EmailQueueResult {
  queued: number;
  skipped: number;
  message?: string;
}

export interface EmailSendResult {
  configured: boolean;
  sent: number;
  failed: number;
  message?: string;
}

export interface EmailRepository {
  list(tournamentId: string): Promise<EmailOutboxMessage[]>;
  /** Creates the drafts. It never claims that mail was sent. */
  queue(tournamentId: string, kind: "confirmation" | "reminder"): Promise<EmailQueueResult>;
  /** Sends queued drafts through the configured provider. */
  sendQueued(tournamentId: string): Promise<EmailSendResult>;
  /** Moves failed rows back to queued after the organizer fixes the provider. */
  retryFailed(tournamentId: string): Promise<number>;
}

export function toEmailOutboxMessage(row: EmailOutboxRow): EmailOutboxMessage {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    registrationId: row.registration_id,
    recipientEmail: row.recipient_email,
    recipientName: row.recipient_name,
    kind: row.kind,
    subject: row.subject,
    body: row.body,
    status: row.status,
    scheduledFor: row.scheduled_for,
    sentAt: row.sent_at,
    error: row.error,
    createdAt: row.created_at,
  };
}
