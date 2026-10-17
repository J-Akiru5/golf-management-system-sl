import type { Metadata } from "next";
import { HoleView } from "@/components/course/HoleView";

export const metadata: Metadata = { title: "Course & holes" };

export default async function CoursePage({
  searchParams,
}: {
  searchParams: Promise<{ hole?: string }>;
}) {
  const { hole } = await searchParams;
  return <HoleView hole={Number(hole) || 1} />;
}
