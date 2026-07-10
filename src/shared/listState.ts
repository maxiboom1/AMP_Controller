import type { ChannelId, InventoryClip, PersistedState, PlaylistItem } from "./types.js";

export function createPlaylistItem(clip: InventoryClip): PlaylistItem {
  return {
    id: `${clip.fullPath}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    clipName: clip.name,
    folder: clip.folder,
    fullPath: clip.fullPath,
    commandId: clip.commandId,
    online: clip.online,
    duration: clip.duration,
    loop: false,
    assignedChannel: null,
    state: "idle"
  };
}

function clipNameKey(clipName: string): string {
  return clipName.trim().toLocaleLowerCase();
}

export function hasClipName(items: PlaylistItem[], clipName: string): boolean {
  const key = clipNameKey(clipName);
  return items.some((item) => clipNameKey(item.clipName) === key);
}

export function removeDuplicateClipNames(items: PlaylistItem[]): PlaylistItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = clipNameKey(item.clipName);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function removePlaylistItem(items: PlaylistItem[], itemId: string): PlaylistItem[] {
  return items.filter((item) => item.id !== itemId);
}

export function reorderPlaylist(items: PlaylistItem[], fromId: string, beforeId: string | null): PlaylistItem[] {
  const moving = items.find((item) => item.id === fromId);
  if (!moving) {
    return items;
  }

  const without = items.filter((item) => item.id !== fromId);
  if (!beforeId) {
    return [...without, moving];
  }

  const targetIndex = without.findIndex((item) => item.id === beforeId);
  if (targetIndex === -1) {
    return [...without, moving];
  }

  return [...without.slice(0, targetIndex), moving, ...without.slice(targetIndex)];
}

export function assignItemToChannel(items: PlaylistItem[], itemId: string, channel: ChannelId): PlaylistItem[] {
  return items.map((item) => {
    if (item.id === itemId) {
      return {
        ...item,
        assignedChannel: item.assignedChannel === channel ? null : channel,
        state: item.assignedChannel === channel ? "idle" : item.state
      };
    }

    return item;
  });
}

export function setItemLoop(items: PlaylistItem[], itemId: string, loop: boolean): PlaylistItem[] {
  return items.map((item) => (item.id === itemId ? { ...item, loop } : item));
}

export function setItemState(items: PlaylistItem[], itemId: string, state: PlaylistItem["state"]): PlaylistItem[] {
  const target = items.find((item) => item.id === itemId);
  return items.map((item) => {
    if (item.id === itemId) {
      return { ...item, state };
    }

    if (state !== "idle" && target?.assignedChannel && item.assignedChannel === target.assignedChannel && item.state !== "idle") {
      return { ...item, state: "idle" };
    }

    return item;
  });
}

export function reconcileOnlineState(state: PersistedState, onlinePaths: Set<string>): PersistedState {
  return {
    ...state,
    playlist: state.playlist.map((item) => ({
      ...item,
      online: onlinePaths.has(item.fullPath) || onlinePaths.has(item.commandId) || onlinePaths.has(`${item.folder}/${item.clipName}`)
    }))
  };
}

export function reconcilePlaylistDurations(state: PersistedState, clips: InventoryClip[]): PersistedState {
  return {
    ...state,
    playlist: state.playlist.map((item) => {
      const clip = clips.find(
        (entry) =>
          entry.fullPath === item.fullPath ||
          entry.commandId === item.commandId ||
          `${entry.folder}/${entry.name}` === `${item.folder}/${item.clipName}`
      );
      return clip ? { ...item, duration: clip.duration } : item;
    })
  };
}
