import { describe, expect, it } from "vitest";
import * as inbox from "./index";

describe("public inbox API", () => {
  it("exports the functions and the shared threshold", () => {
    expect(typeof inbox.applyScanEvent).toBe("function");
    expect(typeof inbox.scanReadiness).toBe("function");
    expect(typeof inbox.markerCandidates).toBe("function");
    expect(typeof inbox.planBatchUpload).toBe("function");
    expect(typeof inbox.suggestForScan).toBe("function");
    expect(inbox.LOW_CONFIDENCE_THRESHOLD).toBe(0.6);
  });
});
