import { describe, expect, it, vi } from "vitest";
import {
  assignItemToChannel,
  createPlaylistItem,
  hasClipName,
  reconcileOnlineState,
  removePlaylistItem,
  removeDuplicateClipNames,
  reorderPlaylist,
  setItemLoop,
  setItemState
} from "../src/shared/listState.js";
import type { InventoryClip, PlaylistItem } from "../src/shared/types.js";

function clip(name: string): InventoryClip {
  return {
    id: `V:/IMPORTS/${name}`,
    name,
    folder: "IMPORTS",
    fullPath: `V:/IMPORTS/${name}`,
    commandId: name,
    online: true
  };
}

describe("playlist state", () => {
  it("creates playlist items from inventory clips", () => {
    vi.spyOn(Date, "now").mockReturnValue(123);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    expect(createPlaylistItem(clip("A"))).toMatchObject({
      clipName: "A",
      fullPath: "V:/IMPORTS/A",
      commandId: "A",
      online: true,
      loop: false,
      assignedChannel: null,
      state: "idle"
    });
  });

  it("reorders items by drag target", () => {
    const items = ["a", "b", "c"].map((id) => ({ id }) as PlaylistItem);
    expect(reorderPlaylist(items, "c", "a").map((item) => item.id)).toEqual(["c", "a", "b"]);
    expect(reorderPlaylist(items, "a", null).map((item) => item.id)).toEqual(["b", "c", "a"]);
  });

  it("removes playlist items", () => {
    const items = ["a", "b", "c"].map((id) => ({ id }) as PlaylistItem);
    expect(removePlaylistItem(items, "b").map((item) => item.id)).toEqual(["a", "c"]);
  });

  it("prevents duplicate clip names in the playlist", () => {
    const items = [
      { id: "1", clipName: "FIX LEBANON" },
      { id: "2", clipName: "fix lebanon" },
      { id: "3", clipName: "NBA_2" }
    ] as PlaylistItem[];
    expect(hasClipName(items, " FIX LEBANON ")).toBe(true);
    expect(removeDuplicateClipNames(items).map((item) => item.id)).toEqual(["1", "3"]);
  });

  it("allows multiple items to be assigned to the same channel", () => {
    const items = [
      { id: "1", assignedChannel: "A", state: "cued" },
      { id: "2", assignedChannel: null, state: "idle" }
    ] as PlaylistItem[];
    const next = assignItemToChannel(items, "2", "A");
    expect(next[0]).toMatchObject({ assignedChannel: "A", state: "cued" });
    expect(next[1]).toMatchObject({ assignedChannel: "A" });
  });

  it("updates loop and cue/play state", () => {
    const items = [
      { id: "1", assignedChannel: "A", state: "cued", loop: false },
      { id: "2", assignedChannel: "A", state: "playing", loop: false }
    ] as PlaylistItem[];
    expect(setItemLoop(items, "1", true)[0].loop).toBe(true);
    expect(setItemState(items, "1", "playing")).toMatchObject([{ state: "playing" }, { state: "idle" }]);
    expect(setItemState(items, "2", "cued")).toMatchObject([{ state: "idle" }, { state: "cued" }]);
  });

  it("reconciles online state", () => {
    const state = {
      selectedFolder: "",
      selectedItemId: null,
      playlist: [
        { id: "1", fullPath: "V:/IMPORTS/A", folder: "IMPORTS", clipName: "A", online: true },
        { id: "2", fullPath: "V:/IMPORTS/B", folder: "IMPORTS", clipName: "B", commandId: "B", online: true }
      ] as PlaylistItem[]
    };
    expect(reconcileOnlineState(state, new Set(["B"])).playlist.map((item) => item.online)).toEqual([false, true]);
  });
});
