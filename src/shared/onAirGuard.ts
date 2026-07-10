import type { PlayerState, PlaylistItem } from "./types.js";

function normalizeCommandId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  const normalized = trimmed.replace(/\\/g, "/").replace(/^V:\//i, "").replace(/^\/+/, "");
  const parts = normalized.split("/").filter(Boolean);
  return (parts.at(-1) ?? normalized).toLowerCase();
}

function idsMatch(left: string, right: string): boolean {
  return normalizeCommandId(left) === normalizeCommandId(right);
}

export function isLoadedOnAirPlaylistItem(item: PlaylistItem, player: PlayerState): boolean {
  if (!item.assignedChannel || item.assignedChannel !== player.channel || !player.onAir || !player.loadedPath) {
    return false;
  }

  return (
    idsMatch(item.commandId, player.loadedPath) ||
    idsMatch(item.fullPath, player.loadedPath) ||
    idsMatch(`${item.folder}/${item.clipName}`, player.loadedPath) ||
    idsMatch(item.clipName, player.currentClip)
  );
}
