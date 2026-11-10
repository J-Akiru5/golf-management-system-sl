import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FeedbackInbox } from "@/components/feedback/FeedbackInbox";
import { PageHeader } from "@/components/PageHeader";
import { DeskAccessError, getDeskMember } from "@/lib/auth/member";
import { DEMO_CLUB_ID } from "@/lib/demo/feedback";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Feedback inbox" };

/**
 * The organizer's private feedback inbox.
 *
 * This route is deliberately `/feedback-inbox`, not `/feedback`: Next.js route groups cannot hold
 * two pages at the same URL, and `/feedback` is the public form.
 *
 * The gate is here as well as in the proxy. A signed-out visitor is sent to sign in; a signed-in
 * account without a club membership is sent to its own area. RLS still decides which rows are
 * visible and who may change a status, so this page is never the only guard.
 */
export default async function FeedbackInboxPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="grid gap-6">
        <PageHeader overline="Public feedback" title="Feedback inbox">
          Notes sent from the public feedback page. Only club staff can read them.
        </PageHeader>
        <FeedbackInbox clubId={DEMO_CLUB_ID} role="organizer" displayName="Demo organizer" />
      </div>
    );
  }

  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    redirect(`/login?next=${encodeURIComponent("/feedback-inbox")}&error=sign_in_required`);
  }

  const member = await getDeskMember(client, data.user.id).catch((accessError: unknown) => {
    if (accessError instanceof DeskAccessError) redirect("/my");
    throw accessError;
  });

  return (
    <div className="grid gap-6">
      <PageHeader overline="Public feedback" title="Feedback inbox">
        Notes sent from the public feedback page. Newest first. Only club staff can read them, and
        only an owner or organizer can change a status.
      </PageHeader>
      <FeedbackInbox clubId={member.clubId} role={member.role} displayName={member.displayName} />
    </div>
  );
}
