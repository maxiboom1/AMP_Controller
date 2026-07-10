import { describe, expect, it } from "vitest";
import { defaultPlayerState, withCommandedLoop, withReportedLoop, withUnknownLoop } from "../src/main/playerState.js";

describe("player state helpers", () => {
  it("keeps commanded and reported loop state explicit", () => {
    const defaultState = defaultPlayerState("A");
    expect(defaultState).toMatchObject({
      loop: false,
      commandedLoop: false,
      reportedLoop: null,
      loopSource: "unknown"
    });

    const commanded = withCommandedLoop(defaultState, true);
    expect(commanded).toMatchObject({
      loop: true,
      commandedLoop: true,
      reportedLoop: null,
      loopSource: "commanded"
    });

    expect(withReportedLoop(commanded, false)).toMatchObject({
      loop: true,
      commandedLoop: true,
      reportedLoop: false,
      loopSource: "commanded"
    });
    expect(withReportedLoop(defaultState, true)).toMatchObject({
      loop: true,
      reportedLoop: true,
      loopSource: "reported"
    });
    expect(withUnknownLoop(commanded)).toMatchObject({
      loop: false,
      commandedLoop: false,
      reportedLoop: null,
      loopSource: "unknown"
    });
  });
});
