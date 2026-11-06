"use client";

import { useParams } from "next/navigation";
import { GroupScore } from "@/components/staff/GroupScore";

export default function StaffGroupScorePage() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  return <GroupScore groupId={id} />;
}
