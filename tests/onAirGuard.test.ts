import { describe, expect, it } from "vitest";
import { defaultPlayerState } from "../src/main/playerState.js";
import { isLoadedOnAirPlaylistItem } from "../src/shared/onAirGuard.js";
import type { PlaylistItem } from "../src/shared/types.js";

const item: PlaylistItem = {
  id: "1",
  clipName: "ONE",
  folder: "IMPORTS",
  fullPath: "V:/IMPORTS/ONE",
  commandId: "ONE",
  online: true,
  loop: false,
  assignedChannel: "A",
  state: "playing"
};

describe("OnAir Guard row matching", () => {
  it("matches only the loaded playlist row for the on-air channel", () => {
    const player = {
      ...defaultPlayerState("A"),
      onAir: true,
      loadedPath: "IMPORTS/ONE",
      currentClip: "ONE"
    };

    expect(isLoadedOnAirPlaylistItem(item, player)).toBe(true);
    expect(isLoadedOnAirPlaylistItem({ ...item, commandId: "TWO", clipName: "TWO", fullPath: "V:/IMPORTS/TWO" }, player)).toBe(false);
    expect(isLoadedOnAirPlaylistItem({ ...item, assignedChannel: "B" }, player)).toBe(false);
    expect(isLoadedOnAirPlaylistItem(item, { ...player, onAir: false })).toBe(false);
  });
});
