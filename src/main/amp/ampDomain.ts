import type { InventoryClip } from "../../shared/types.js";

export interface NormalizedLoadedId {
  raw: string;
  commandId: string;
  clipName: string;
  path: string;
}

export function normalizeClipCommandId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  const normalized = trimmed.replace(/\\/g, "/").replace(/^V:\//i, "").replace(/^\/+/, "");
  const parts = normalized.split("/").filter(Boolean);
  return parts.at(-1) ?? normalized;
}

export function normalizeLoadedId(raw: string): NormalizedLoadedId {
  const path = raw.trim().replace(/\\/g, "/").replace(/^V:\//i, "").replace(/^\/+/, "");
  const commandId = normalizeClipCommandId(path);

  return {
    raw,
    commandId,
    clipName: commandId,
    path
  };
}

export function commandIdsMatch(left: string, right: string): boolean {
  const normalizedLeft = normalizeClipCommandId(left).toLowerCase();
  const normalizedRight = normalizeClipCommandId(right).toLowerCase();
  return normalizedLeft === normalizedRight;
}

export function clipMatchesLoadedId(clip: InventoryClip, loadedId: string): boolean {
  return (
    commandIdsMatch(clip.commandId, loadedId) ||
    commandIdsMatch(clip.fullPath, loadedId) ||
    commandIdsMatch(`${clip.folder}/${clip.name}`, loadedId)
  );
}
