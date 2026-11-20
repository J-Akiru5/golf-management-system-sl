/**
 * Reading a Server-Sent Event body in the panel.
 *
 * `TextDecoder` gives arbitrary slices, so frames are only read once the `\n\n` that ends them has
 * arrived; the tail stays in the buffer for the next read. Pure, so the awkward case (a frame split
 * across three reads) is a test rather than a bug report from a phone.
 */

/** Splits the buffered text into whole frames and returns what is left for the next read. */
export function takeSseFrames(buffer: string): { frames: string[]; rest: string } {
  const normalised = buffer.replace(/\r\n/g, "\n");
  const parts = normalised.split("\n\n");
  const rest = parts.pop() ?? "";
  return { frames: parts.filter((part) => part.trim() !== ""), rest };
}

/** The JSON payloads in one frame. A frame without a `data:` line yields nothing. */
export function framePayloads(frame: string): unknown[] {
  const payloads: unknown[] = [];
  for (const line of frame.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const raw = line.slice(5).trim();
    if (raw === "") continue;
    try {
      payloads.push(JSON.parse(raw));
    } catch {
      // A frame that is not JSON is ignored; the panel keeps the reply it already has.
    }
  }
  return payloads;
}
