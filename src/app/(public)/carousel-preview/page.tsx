import { notFound } from "next/navigation";
import CarouselPreview from "../_carousel-preview/page";

/**
 * Dev-only entry point. The implementation lives in the private, non-routable `_carousel-preview`
 * folder, and this 404s anywhere but a development run.
 */
export default function CarouselPreviewRoute() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <CarouselPreview />;
}
