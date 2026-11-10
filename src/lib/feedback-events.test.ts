import { afterEach, describe, expect, it, vi } from "vitest";
import { FEEDBACK_CHANGED_EVENT, notifyFeedbackChanged } from "./feedback-events";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("notifyFeedbackChanged", () => {
  it("dispatches the private change event and carries no note content", () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });

    notifyFeedbackChanged();

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const event = dispatchEvent.mock.calls[0]?.[0] as Event | undefined;
    expect(event).toBeInstanceOf(CustomEvent);
    expect(event?.type).toBe(FEEDBACK_CHANGED_EVENT);
    expect((event as CustomEvent).detail).toBeNull();
  });

  it("does nothing in a server render", () => {
    expect(() => notifyFeedbackChanged()).not.toThrow();
  });
});
