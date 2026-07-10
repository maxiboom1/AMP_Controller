import { describe, expect, it } from "vitest";
import { isShortClip } from "../src/shared/clipDuration.js";

describe("clip duration helpers", () => {
  it("flags clips shorter than the configured threshold", () => {
    expect(isShortClip("00:00:09:24", 10, 25)).toBe(true);
    expect(isShortClip("00:00:10:00", 10, 25)).toBe(false);
    expect(isShortClip("00:00:05:00", 0, 25)).toBe(false);
    expect(isShortClip(undefined, 10, 25)).toBe(false);
  });
});
