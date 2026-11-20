import Link from "next/link";
import { BrandMark } from "@/components/shell/brand-mark";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-10">
      <BrandMark />
      <h1 className="text-2xl">Page not found</h1>
      <p className="hint">
        This page does not exist, or the workspace is not open. Check the address, then try again.
      </p>
      <p>
        <Link href="/">Go to the overview</Link>
      </p>
    </main>
  );
}
