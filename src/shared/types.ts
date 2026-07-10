export type ChannelId = "A" | "B" | "C" | "D";

export type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

export type CuePlayState = "idle" | "cued" | "playing";

export type LoggingLevel = "normal" | "debug";

export interface ShortcutSettings {
  play: string;
  cue: string;
  loop: string;
  assignA: string;
  assignB: string;
  assignC: string;
  assignD: string;
}

export interface AppSettings {
  triaIp: string;
  port: number;
  shortcuts: ShortcutSettings;
  workingFolder: string;
  idChangePollMs: number;
  inventoryFullRefreshMs: number;
  transportPollMs: number;
  frameRate: number;
  shortClipThresholdSeconds: number;
  tallyEnabled: boolean;
  tallyPort: number;
  tallyChannelIds: Record<ChannelId, number>;
  onAirGuardEnabled: boolean;
  loggingLevel: LoggingLevel;
}

export interface InventoryClip {
  id: string;
  name: string;
  folder: string;
  fullPath: string;
  commandId: string;
  online: boolean;
  duration?: string;
}

export interface InventoryFolder {
  id: string;
  name: string;
  path: string;
}

export interface PlaylistItem {
  id: string;
  clipName: string;
  folder: string;
  fullPath: string;
  commandId: string;
  online: boolean;
  duration?: string;
  loop: boolean;
  assignedChannel: ChannelId | null;
  state: CuePlayState;
}

export interface PlayerState {
  channel: ChannelId;
  ampChannel: string;
  connection: ConnectionState;
  currentClip: string;
  loadedPath: string;
  loop: boolean;
  commandedLoop: boolean;
  reportedLoop: boolean | null;
  loopSource: "commanded" | "reported" | "unknown";
  state: CuePlayState;
  timecode: string;
  remaining: string;
  lastMessage: string;
  onAir: boolean;
}

export interface PersistedState {
  playlist: PlaylistItem[];
  selectedItemId: string | null;
  selectedFolder: string;
}

export interface StatusMessage {
  level: "info" | "warn" | "error";
  text: string;
  at: string;
}

export interface TslIncomingMessage {
  at: string;
  sourceId: number;
  channel: ChannelId;
  state: "on-air" | "off-air";
  kind: "update" | "sync-message";
  text: string;
}

export interface TallyRuntimeState {
  enabled: boolean;
  listening: boolean;
  clientCount: number;
  port: number;
  lastMessage: string;
  recentMessages: TslIncomingMessage[];
}

export interface AppSnapshot {
  appVersion: string;
  settings: AppSettings;
  state: PersistedState;
  inventory: {
    folders: InventoryFolder[];
    clips: InventoryClip[];
    selectedFolder: string;
    loading: boolean;
  };
  players: Record<ChannelId, PlayerState>;
  tally: TallyRuntimeState;
  status: StatusMessage;
}

export interface AmpConnectionSummary {
  channel: ChannelId;
  ampChannel: string;
  state: ConnectionState;
  lastMessage: string;
}

export interface AmpParsedMessage {
  code: string;
  kind: "ack" | "nak" | "error" | "complete" | "payload";
  length?: number;
  payloadHex?: string;
  raw: string;
}

export interface AppApi {
  getSnapshot: () => Promise<AppSnapshot>;
  saveSettings: (settings: AppSettings) => Promise<AppSnapshot>;
  connect: () => Promise<AppSnapshot>;
  disconnect: () => Promise<AppSnapshot>;
  refreshInventory: () => Promise<AppSnapshot>;
  setInventoryFolder: (folder: string) => Promise<AppSnapshot>;
  saveState: (state: PersistedState) => Promise<AppSnapshot>;
  cueItem: (itemId: string) => Promise<AppSnapshot>;
  playItem: (itemId: string) => Promise<AppSnapshot>;
  playChannel: (channel: ChannelId) => Promise<AppSnapshot>;
  pauseChannel: (channel: ChannelId) => Promise<AppSnapshot>;
  ejectChannel: (channel: ChannelId) => Promise<AppSnapshot>;
  setLoop: (itemId: string, enabled: boolean) => Promise<AppSnapshot>;
  setChannelLoop: (channel: ChannelId, enabled: boolean) => Promise<AppSnapshot>;
  notify: (text: string) => Promise<AppSnapshot>;
  clearTallyMessages: () => Promise<AppSnapshot>;
  openLogsFolder: () => Promise<string>;
  onSnapshot: (callback: (snapshot: AppSnapshot) => void) => () => void;
  onMenuAction: (callback: (action: "settings") => void) => () => void;
}
