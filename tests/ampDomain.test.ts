import { describe, expect, it } from "vitest";
import { commandIdsMatch, normalizeClipCommandId, normalizeLoadedId } from "../src/main/amp/ampDomain.js";

describe("AMP domain identifiers", () => {
  it("normalizes loaded IDs from production path variants to the clip command ID", () => {
    for (const value of ["\\IMPORTS\\TEST", "V:/IMPORTS/TEST", "IMPORTS/TEST", "TEST", "V:/IMPORTS/\\IMPORTS\\TEST"]) {
      expect(normalizeLoadedId(value)).toMatchObject({
        commandId: "TEST",
        clipName: "TEST"
      });
      expect(normalizeClipCommandId(value)).toBe("TEST");
    }
  });

  it("matches command IDs across raw clip names and Tria paths", () => {
    expect(commandIdsMatch("TEST", "\\IMPORTS\\TEST")).toBe(true);
    expect(commandIdsMatch("V:/IMPORTS/TEST", "IMPORTS/TEST")).toBe(true);
    expect(commandIdsMatch("OPENING", "CLOSING")).toBe(false);
  });
});
