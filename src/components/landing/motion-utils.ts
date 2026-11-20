export type LandingMotionFacts = {
  reducedMotion: boolean;
  saveData?: boolean;
  deviceMemory?: number;
  hardwareConcurrency?: number;
  coarsePointer: boolean;
  viewportWidth: number;
};

export type LandingMotionTier = "none" | "lite" | "full";

export function pickLandingMotionTier(facts: LandingMotionFacts): LandingMotionTier {
  if (facts.reducedMotion) return "none";
  if (
    facts.saveData ||
    (facts.deviceMemory !== undefined && facts.deviceMemory <= 4) ||
    (facts.hardwareConcurrency !== undefined && facts.hardwareConcurrency <= 4) ||
    (facts.coarsePointer && facts.viewportWidth < 768)
  ) {
    return "lite";
  }
  return "full";
}

export function formatLandingCount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}
