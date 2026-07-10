import { CHANNELS, isChannelId } from "../shared/channels.js";
import type { AppSettings, ChannelId, PersistedState, PlaylistItem, ShortcutSettings } from "../shared/types.js";
import { defaultSettings, defaultState } from "./storage.js";

const SHORTCUT_KEYS: Array<keyof ShortcutSettings> = ["play", "cue", "loop", "assignA", "assignB", "assignC", "assignD"];

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function sanitizeSettings(value: unknown): AppSettings {
  const input = (value && typeof value === "object" ? value : {}) as Partial<AppSettings>;
  const shortcutsInput = (input.shortcuts && typeof input.shortcuts === "object" ? input.shortcuts : {}) as Partial<ShortcutSettings>;
  const tallyInput =
    input.tallyChannelIds && typeof input.tallyChannelIds === "object" ? (input.tallyChannelIds as Partial<Record<ChannelId, number>>) : {};
  const shortcuts = { ...defaultSettings.shortcuts };
  const tallyChannelIds = { ...defaultSettings.tallyChannelIds };
  const tallyPort = numberValue(input.tallyPort, defaultSettings.tallyPort);

  for (const key of SHORTCUT_KEYS) {
    shortcuts[key] = stringValue(shortcutsInput[key], defaultSettings.shortcuts[key]).trim() || defaultSettings.shortcuts[key];
  }

  for (const channel of CHANNELS) {
    tallyChannelIds[channel] = Math.max(0, numberValue(tallyInput[channel], defaultSettings.tallyChannelIds[channel]));
  }

  return {
    ...defaultSettings,
    triaIp: stringValue(input.triaIp, defaultSettings.triaIp).trim() || defaultSettings.triaIp,
    port: numberValue(input.port, defaultSettings.port),
    workingFolder: stringValue(input.workingFolder, defaultSettings.workingFolder).trim(),
    idChangePollMs: numberValue(input.idChangePollMs, defaultSettings.idChangePollMs),
    inventoryFullRefreshMs: numberValue(input.inventoryFullRefreshMs, defaultSettings.inventoryFullRefreshMs),
    transportPollMs: numberValue(input.transportPollMs, defaultSettings.transportPollMs),
    frameRate: numberValue(input.frameRate, defaultSettings.frameRate),
    shortClipThresholdSeconds: Math.max(0, numberValue(input.shortClipThresholdSeconds, defaultSettings.shortClipThresholdSeconds)),
    tallyEnabled: input.tallyEnabled !== false,
    tallyPort: tallyPort > 0 ? tallyPort : defaultSettings.tallyPort,
    tallyChannelIds,
    onAirGuardEnabled: input.onAirGuardEnabled !== false,
    loggingLevel: input.loggingLevel === "debug" ? "debug" : "normal",
    shortcuts
  };
}

function sanitizeChannel(value: unknown): ChannelId | null {
  return isChannelId(value) ? value : null;
}

function sanitizePlaylistItem(value: unknown): PlaylistItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Partial<PlaylistItem>;
  const id = stringValue(item.id).trim();
  const clipName = stringValue(item.clipName).trim();
  const commandId = stringValue(item.commandId, clipName).trim();
  const fullPath = stringValue(item.fullPath, commandId).trim();
  if (!id || !clipName) {
    return null;
  }

  return {
    id,
    clipName,
    folder: stringValue(item.folder).trim(),
    fullPath,
    commandId,
    online: typeof item.online === "boolean" ? item.online : true,
    duration: stringValue(item.duration).trim() || undefined,
    loop: typeof item.loop === "boolean" ? item.loop : false,
    assignedChannel: sanitizeChannel(item.assignedChannel),
    state: item.state === "cued" || item.state === "playing" ? item.state : "idle"
  };
}

export function sanitizePersistedState(value: unknown): PersistedState {
  const input = (value && typeof value === "object" ? value : {}) as Partial<PersistedState>;
  const playlist = Array.isArray(input.playlist)
    ? input.playlist.flatMap((item) => {
        const sanitized = sanitizePlaylistItem(item);
        return sanitized ? [sanitized] : [];
      })
    : defaultState.playlist;
  const selectedItemId = stringValue(input.selectedItemId).trim();

  return {
    playlist,
    selectedItemId: selectedItemId && playlist.some((item) => item.id === selectedItemId) ? selectedItemId : null,
    selectedFolder: stringValue(input.selectedFolder, defaultState.selectedFolder).trim()
  };
}
