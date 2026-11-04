/**
 * How a camera frame is cropped down to the card's shape.
 *
 * The printed IGCC card is 1800 x 1000, so a photo taken through the framing guide is cropped to
 * the same 9:5 band. The crop is centred and never upscaled: a phone held in portrait gives a wide
 * strip out of the middle of the sensor, which is exactly what the guide shows on screen.
 */
export const CARD_ASPECT = 1.8;

export interface CardFrame {
  /** Source rectangle inside the video frame, in video pixels. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export function cardFrame(
  videoWidth: number,
  videoHeight: number,
  aspect: number = CARD_ASPECT,
): CardFrame | null {
  if (!(videoWidth > 0) || !(videoHeight > 0) || !(aspect > 0)) return null;
  let sw = Math.round(videoWidth);
  let sh = Math.round(sw / aspect);
  if (sh > videoHeight) {
    sh = Math.round(videoHeight);
    sw = Math.round(sh * aspect);
  }
  if (sw > videoWidth) sw = Math.round(videoWidth);
  return {
    sx: Math.max(0, Math.round((videoWidth - sw) / 2)),
    sy: Math.max(0, Math.round((videoHeight - sh) / 2)),
    sw,
    sh,
  };
}

/** The canvas width for a capture: the cropped frame, capped so a 4K sensor is not uploaded. */
export function cardCaptureWidth(frame: CardFrame, cap = 2400): number {
  return Math.max(1, Math.min(Math.round(frame.sw), cap));
}
