import { app, BrowserWindow } from "electron";
import type {
  AppSettings,
  AppSnapshot,
  ChannelId,
  InventoryClip,
  InventoryFolder,
  PersistedState,
  PlayerState,
  StatusMessage,
  TallyRuntimeState
} from "../shared/types.js";
import { CHANNELS, isChannelId } from "../shared/channels.js";
import {
  reconcileOnlineState,
  reconcilePlaylistDurations,
  removeDuplicateClipNames,
  setItemLoop,
  setItemState
} from "../shared/listState.js";
import { framesToTimecode, timecodeToFrames } from "../shared/timecode.js";
import {
  AMP,
  buildAmpStringCommand,
  decodeAmpNameList,
  isEmptyFolderMarker,
  normalizeClipPath,
  parseIdsChangedPayload,
  parseStatusSense,
  parseTimecodeHex
} from "./amp/ampProtocol.js";
import { commandIdsMatch, normalizeClipCommandId, normalizeLoadedId } from "./amp/ampDomain.js";
import { AmpClient } from "./amp/ampClient.js";
import { sanitizePersistedState, sanitizeSettings } from "./ipcValidation.js";
import { installAppIpc } from "./ipcHandlers.js";
import { AppLogger } from "./logger.js";
import { defaultPlayerState, withCommandedLoop, withReportedLoop, withUnknownLoop } from "./playerState.js";
import { AppStorage } from "./storage.js";
import { TallyListener } from "./tally/tallyListener.js";

export class AppController {
  private settings: AppSettings;
  private state: PersistedState;
  private inventory = {
    folders: [] as InventoryFolder[],
    clips: [] as InventoryClip[],
    selectedFolder: "",
    loading: false
  };
  private players: Record<ChannelId, PlayerState> = {
    A: defaultPlayerState("A"),
    B: defaultPlayerState("B"),
    C: defaultPlayerState("C"),
    D: defaultPlayerState("D")
  };
  private status: StatusMessage = {
    level: "info",
    text: "Ready",
    at: new Date().toISOString()
  };
  private tallyRuntime: TallyRuntimeState = {
    enabled: true,
    listening: false,
    clientCount: 0,
    port: 8900,
    lastMessage: "",
    recentMessages: []
  };
  private pendingAck: "setFolder" | null = null;
  private folderLoad: {
    requestedFolder: string;
    candidates: string[];
    index: number;
    currentClipCount: number;
    clips: InventoryClip[];
  } | null = null;
  private idChangePollTimer: NodeJS.Timeout | null = null;
  private inventoryRefreshTimer: NodeJS.Timeout | null = null;
  private transportPollTimer: NodeJS.Timeout | null = null;
  private currentIdPollCounter = 0;
  private didInitialInventoryRefresh = false;
  private clipDurations = new Map<string, string>();
  private failedDurationRequests = new Set<string>();
  private durationQueue: string[] = [];
  private pendingDurationByChannel: Record<ChannelId, string | null> = {
    A: null,
    B: null,
    C: null,
    D: null
  };
  private autoModeSent: Record<ChannelId, boolean> = {
    A: false,
    B: false,
    C: false,
    D: false
  };
  private initialEjectSent: Record<ChannelId, boolean> = {
    A: false,
    B: false,
    C: false,
    D: false
  };
  private workingBinSent: Record<ChannelId, string | null> = {
    A: null,
    B: null,
    C: null,
    D: null
  };
  private cueSequence: Record<ChannelId, number> = {
    A: 0,
    B: 0,
    C: 0,
    D: 0
  };
  private commandedLoop: Record<ChannelId, boolean> = {
    A: false,
    B: false,
    C: false,
    D: false
  };
  private reportedConnectionText = "";

  constructor(
    private storage: AppStorage,
    private amp: AmpClient,
    private logger: AppLogger,
    private tally?: TallyListener
  ) {
    this.settings = this.storage.getSettings();
    this.logger.setLevel(this.settings.loggingLevel);
    this.tallyRuntime = {
      ...this.tallyRuntime,
      enabled: this.settings.tallyEnabled,
      port: this.settings.tallyPort,
      lastMessage: this.settings.tallyEnabled ? "" : "TSL disabled"
    };
    this.state = sanitizePersistedState(this.storage.getState());
    this.state = this.storage.saveState({
      ...this.state,
      playlist: removeDuplicateClipNames(this.state.playlist)
    });
    this.inventory.selectedFolder = this.settings.workingFolder || this.state.selectedFolder;

    this.amp.on("status", (summary) => {
      for (const channel of CHANNELS) {
        this.players[channel] = {
          ...this.players[channel],
          connection: summary[channel].state,
          lastMessage: summary[channel].lastMessage
        };
        if (summary[channel].state === "connected" && !this.initialEjectSent[channel]) {
          this.initialEjectSent[channel] = true;
          this.amp.send(channel, AMP.EJECT, `initial eject ${channel}`);
          this.commandedLoop[channel] = false;
          this.players[channel] = withCommandedLoop(this.players[channel], false);
        }
        if (summary[channel].state === "connected" && !this.autoModeSent[channel]) {
          this.autoModeSent[channel] = true;
          this.amp.send(channel, AMP.AUTO_MODE_ON, `auto mode ${channel}`);
        }
        if (summary[channel].state === "connected") {
          this.sendWorkingBin(channel, "connect");
        }
        if (summary[channel].state !== "connected") {
          this.initialEjectSent[channel] = false;
          this.autoModeSent[channel] = false;
          this.workingBinSent[channel] = null;
          this.players[channel] = withUnknownLoop(this.players[channel]);
        }
      }
      this.applyConnectionStatus(summary);
      if (summary.A.state === "connected" && !this.didInitialInventoryRefresh) {
        this.didInitialInventoryRefresh = true;
        setTimeout(() => {
          if (this.amp.isConnected("A") && !this.inventory.loading && this.inventory.clips.length === 0) {
            this.refreshInventory();
          }
        }, 500);
      }
      this.broadcast();
    });

    this.amp.on("message", (channel, message) => {
      if (this.settings.loggingLevel === "debug") {
        void this.logger.write("INFO", `Parsed AMP ${message.code} on ${channel}`, message);
      }
      this.handleAmpMessage(channel, message.code, message.payloadHex);
    });

    this.tally?.on("source", (sourceId, text, state, kind) => {
      this.handleTallySource(sourceId, text, state, kind);
    });
    this.tally?.on("status", (status) => {
      this.tallyRuntime = {
        ...this.tallyRuntime,
        enabled: this.settings.tallyEnabled,
        listening: this.settings.tallyEnabled && status.listening,
        clientCount: this.settings.tallyEnabled ? status.clientCount : 0,
        port: status.port ?? this.settings.tallyPort,
        lastMessage: status.text
      };
      void this.logger.write("INFO", status.text);
      this.broadcast();
    });
    this.tally?.on("error", (message) => {
      this.setStatus("warn", message);
      this.broadcast();
    });
    this.syncTallyListener();
  }

  installIpc(): void {
    installAppIpc(this);
  }

  snapshot(): AppSnapshot {
    return {
      appVersion: app.getVersion(),
      settings: this.settings,
      state: this.state,
      inventory: this.inventory,
      players: this.players,
      tally: this.tallyRuntime,
      status: this.status
    };
  }

  saveSettings(settings: unknown): AppSnapshot {
    const previousWorkingFolder = this.settings.workingFolder;
    const previousTallyPort = this.settings.tallyPort;
    const previousTallyEnabled = this.settings.tallyEnabled;
    this.settings = this.storage.saveSettings(sanitizeSettings(settings));
    this.logger.setLevel(this.settings.loggingLevel);
    this.inventory.selectedFolder = this.settings.workingFolder || this.inventory.selectedFolder;
    if (previousWorkingFolder !== this.settings.workingFolder) {
      for (const channel of CHANNELS) {
        this.workingBinSent[channel] = null;
      }
    }
    if (CHANNELS.some((channel) => this.amp.isConnected(channel))) {
      this.startPolling();
      for (const channel of CHANNELS) {
        this.sendWorkingBin(channel, "settings");
      }
    }
    if (previousTallyPort !== this.settings.tallyPort || previousTallyEnabled !== this.settings.tallyEnabled) {
      this.syncTallyListener();
    } else {
      this.tallyRuntime = {
        ...this.tallyRuntime,
        enabled: this.settings.tallyEnabled,
        port: this.settings.tallyPort
      };
    }
    this.applyTallySource(this.settings.tallyEnabled ? this.currentTallySourceId : null);
    this.setStatus("info", "Settings saved");
    return this.snapshotAndBroadcast();
  }

  connect(): AppSnapshot {
    this.setStatus("info", `Connecting to ${this.settings.triaIp}:${this.settings.port}`);
    this.didInitialInventoryRefresh = false;
    this.reportedConnectionText = "";
    this.failedDurationRequests.clear();
    this.durationQueue = [];
    for (const channel of CHANNELS) {
      this.initialEjectSent[channel] = false;
      this.autoModeSent[channel] = false;
      this.workingBinSent[channel] = null;
      this.cueSequence[channel] += 1;
      this.commandedLoop[channel] = false;
      this.players[channel] = withUnknownLoop(this.players[channel]);
    }
    this.amp.connect(this.settings);
    this.startPolling();
    return this.snapshotAndBroadcast();
  }

  disconnect(): AppSnapshot {
    this.stopPolling();
    this.amp.disconnect();
    this.reportedConnectionText = "";
    this.failedDurationRequests.clear();
    this.durationQueue = [];
    for (const channel of CHANNELS) {
      this.initialEjectSent[channel] = false;
      this.autoModeSent[channel] = false;
      this.workingBinSent[channel] = null;
      this.cueSequence[channel] += 1;
      this.commandedLoop[channel] = false;
      this.players[channel] = withUnknownLoop(this.players[channel]);
    }
    this.inventory.loading = false;
    this.setStatus("info", "Disconnected");
    return this.snapshotAndBroadcast();
  }

  shutdown(): void {
    this.stopPolling();
    this.amp.disconnect();
    this.tally?.stop();
  }

  refreshInventory(): AppSnapshot {
    if (!this.amp.isConnected("A")) {
      this.inventory.loading = false;
      this.setStatus("warn", "Inventory refresh requires channel A to be connected");
      void this.logger.write("WARN", "Inventory refresh blocked, channel A not connected");
      return this.snapshotAndBroadcast();
    }

    this.inventory = {
      ...this.inventory,
      loading: true
    };
    this.pendingAck = null;
    this.folderLoad = null;
    this.failedDurationRequests.clear();
    this.durationQueue = [];
    this.amp.send("A", AMP.LIST_FIRST_FOLDER, "list first folder");
    this.setStatus("info", "Refreshing inventory");
    return this.snapshotAndBroadcast();
  }

  setInventoryFolder(folder: unknown): AppSnapshot {
    const requestedFolder = typeof folder === "string" ? folder.trim() : "";
    const workingFolder = this.settings.workingFolder || requestedFolder;
    const folderChanged = this.inventory.selectedFolder !== workingFolder;
    this.inventory.selectedFolder = workingFolder;
    this.state = this.storage.saveState({
      ...this.state,
      selectedFolder: workingFolder
    });

    if (!this.amp.isConnected("A")) {
      this.setStatus("warn", "Folder selected, but Tria is not connected");
      return this.snapshotAndBroadcast();
    }

    if (folderChanged) {
      this.failedDurationRequests.clear();
      for (const channel of CHANNELS) {
        this.workingBinSent[channel] = null;
        if (channel !== "A") {
          this.sendWorkingBin(channel, "folder selected");
        }
      }
    }
    this.startFolderLoad(workingFolder);
    this.setStatus("info", `Folder selected: ${workingFolder || "root"}`);
    return this.snapshotAndBroadcast();
  }

  private startFolderLoad(folder: string): void {
    this.inventory.loading = true;
    this.folderLoad = {
      requestedFolder: folder,
      candidates: this.buildFolderCandidates(folder),
      index: 0,
      currentClipCount: 0,
      clips: []
    };
    this.sendCurrentFolderCandidate();
  }

  private sendCurrentFolderCandidate(): void {
    if (!this.folderLoad) {
      return;
    }

    const folder = this.folderLoad.candidates[this.folderLoad.index] ?? this.folderLoad.requestedFolder;
    this.folderLoad.currentClipCount = 0;
    this.folderLoad.clips = [];
    this.pendingAck = "setFolder";
    if (this.amp.send("A", buildAmpStringCommand(folder, AMP.SET_BIN), `set folder ${folder}`)) {
      this.workingBinSent.A = folder;
    }
  }

  private buildFolderCandidates(folder: string): string[] {
    const trimmed = folder.trim();
    return trimmed ? [trimmed] : [];
  }

  saveState(state: unknown): AppSnapshot {
    const nextState = sanitizePersistedState(state);
    this.state = this.storage.saveState({
      ...nextState,
      playlist: removeDuplicateClipNames(nextState.playlist)
    });
    return this.snapshotAndBroadcast();
  }

  cueItem(itemId: unknown): AppSnapshot {
    const safeItemId = typeof itemId === "string" ? itemId : "";
    const item = this.state.playlist.find((entry) => entry.id === safeItemId);
    const inhibited = this.getInhibitReason(item);
    if (inhibited) {
      this.setStatus("warn", inhibited);
      return this.snapshotAndBroadcast();
    }
    if (!item) {
      return this.snapshotAndBroadcast();
    }

    const channel = item.assignedChannel as ChannelId;
    const commandId = this.commandIdForItem(item);
    const command = buildAmpStringCommand(commandId, AMP.LOAD_CLIP);
    if (this.amp.send(channel, command, `cue ${commandId}`)) {
      this.state = this.storage.saveState({
        ...this.state,
        playlist: setItemState(this.state.playlist, item.id, "cued")
      });
      this.players[channel] = withCommandedLoop(
        {
          ...this.players[channel],
          currentClip: item.clipName,
          loadedPath: commandId,
          state: "cued"
        },
        item.loop
      );
      this.queuePostCueState(channel, item.loop);
      this.setStatus("info", `Cue sent: ${item.clipName} on ${channel}`);
    }

    return this.snapshotAndBroadcast();
  }

  playItem(itemId: unknown): AppSnapshot {
    const safeItemId = typeof itemId === "string" ? itemId : "";
    const item = this.state.playlist.find((entry) => entry.id === safeItemId);
    const inhibited = this.getInhibitReason(item);
    if (inhibited) {
      this.setStatus("warn", inhibited);
      return this.snapshotAndBroadcast();
    }
    if (!item) {
      return this.snapshotAndBroadcast();
    }

    const channel = item.assignedChannel as ChannelId;
    if (item.state === "idle") {
      this.cueItem(safeItemId);
    }

    if (this.amp.send(channel, AMP.PLAY, `play ${item.clipName}`)) {
      this.state = this.storage.saveState({
        ...this.state,
        playlist: setItemState(this.state.playlist, item.id, "playing")
      });
      this.players[channel] = {
        ...this.players[channel],
        currentClip: item.clipName,
        loadedPath: this.commandIdForItem(item),
        state: "playing"
      };
      this.requestDuration(channel, this.commandIdForItem(item));
      this.setStatus("info", `Playing ${item.clipName} on ${channel}`);
    }

    return this.snapshotAndBroadcast();
  }

  playChannel(channelValue: unknown): AppSnapshot {
    const channel = this.requireChannel(channelValue, "Play");
    if (!channel) {
      return this.snapshotAndBroadcast();
    }

    if (!this.amp.isConnected(channel)) {
      this.setStatus("warn", `Play inhibited: channel ${channel} is not connected`);
      return this.snapshotAndBroadcast();
    }

    if (this.amp.send(channel, AMP.PLAY, `play ${channel}`)) {
      this.players[channel] = {
        ...this.players[channel],
        state: this.players[channel].currentClip ? "playing" : "idle"
      };
      this.syncPlaylistChannelState(channel, this.players[channel].state);
      this.setStatus("info", `Play sent on ${channel}`);
    }

    return this.snapshotAndBroadcast();
  }

  pauseChannel(channelValue: unknown): AppSnapshot {
    const channel = this.requireChannel(channelValue, "Pause");
    if (!channel) {
      return this.snapshotAndBroadcast();
    }

    if (this.amp.send(channel, AMP.STOP, `pause ${channel}`)) {
      this.players[channel] = {
        ...this.players[channel],
        state: this.players[channel].currentClip ? "cued" : "idle"
      };
      this.syncPlaylistChannelState(channel, this.players[channel].state);
      this.setStatus("info", `Paused ${channel}`);
    }
    return this.snapshotAndBroadcast();
  }

  ejectChannel(channelValue: unknown): AppSnapshot {
    const channel = this.requireChannel(channelValue, "Eject");
    if (!channel) {
      return this.snapshotAndBroadcast();
    }

    if (this.amp.send(channel, AMP.EJECT, `eject ${channel}`)) {
      this.cueSequence[channel] += 1;
      this.commandedLoop[channel] = false;
      this.players[channel] = {
        ...defaultPlayerState(channel),
        connection: this.players[channel].connection,
        lastMessage: this.players[channel].lastMessage,
        onAir: this.players[channel].onAir
      };
      this.state = this.storage.saveState({
        ...this.state,
        playlist: this.state.playlist.map((item) => (item.assignedChannel === channel ? { ...item, state: "idle" } : item))
      });
      this.setStatus("info", `Ejected ${channel}`);
    }
    return this.snapshotAndBroadcast();
  }

  setLoop(itemId: unknown, enabled: unknown): AppSnapshot {
    const safeItemId = typeof itemId === "string" ? itemId : "";
    const safeEnabled = enabled === true;
    const item = this.state.playlist.find((entry) => entry.id === safeItemId);
    this.state = this.storage.saveState({
      ...this.state,
      playlist: setItemLoop(this.state.playlist, safeItemId, safeEnabled)
    });

    this.setStatus(
      "info",
      item ? `${safeEnabled ? "Loop enabled" : "Loop disabled"} for ${item.clipName}` : safeEnabled ? "Loop enabled" : "Loop disabled"
    );

    return this.snapshotAndBroadcast();
  }

  setChannelLoop(channel: unknown, enabled: unknown): AppSnapshot {
    const safeChannel = this.requireChannel(channel, "Loop");
    if (!safeChannel) {
      return this.snapshotAndBroadcast();
    }

    const safeEnabled = enabled === true;
    if (
      this.amp.send(
        safeChannel,
        safeEnabled ? AMP.LOOP_ON : AMP.LOOP_OFF,
        safeEnabled ? `loop ${safeChannel} on` : `loop ${safeChannel} off`
      )
    ) {
      this.commandedLoop[safeChannel] = safeEnabled;
      this.players[safeChannel] = withCommandedLoop(this.players[safeChannel], safeEnabled);
      this.amp.send(safeChannel, AMP.STATUS_SENSE_ALL, `verify loop ${safeChannel}`, {
        dedupeKey: `status-${safeChannel}`
      });
      this.setStatus("info", safeEnabled ? `Loop enabled on ${safeChannel}` : `Loop disabled on ${safeChannel}`);
    }
    return this.snapshotAndBroadcast();
  }

  notify(text: unknown): AppSnapshot {
    this.setStatus("info", typeof text === "string" ? text : "");
    return this.snapshotAndBroadcast();
  }

  openLogsFolder(): Promise<string> {
    return this.logger.openFolder();
  }

  clearTallyMessages(): AppSnapshot {
    this.tallyRuntime = {
      ...this.tallyRuntime,
      recentMessages: []
    };
    return this.snapshotAndBroadcast();
  }

  private requireChannel(value: unknown, action: string): ChannelId | null {
    if (isChannelId(value)) {
      return value;
    }

    this.setStatus("warn", `${action} ignored: invalid channel`);
    return null;
  }

  private queuePostCueState(channel: ChannelId, loop: boolean): void {
    const sequence = ++this.cueSequence[channel];
    setTimeout(() => {
      if (this.cueSequence[channel] !== sequence || !this.amp.isConnected(channel)) {
        return;
      }

      if (this.amp.send(channel, loop ? AMP.LOOP_ON : AMP.LOOP_OFF, loop ? "loop on after cue delay" : "loop off after cue delay")) {
        this.commandedLoop[channel] = loop;
        this.players[channel] = withCommandedLoop(this.players[channel], loop);
      }
      this.amp.send(channel, AMP.ID_LOADED_REQUEST, `verify loaded ID ${channel}`, {
        dedupeKey: `loaded-id-${channel}`
      });
      this.amp.send(channel, AMP.STATUS_SENSE_ALL, `verify loop ${channel}`, {
        dedupeKey: `status-${channel}`
      });
      this.broadcast();
    }, 180);
  }

  private handleAmpMessage(channel: ChannelId, code: string, payloadHex?: string): void {
    if (channel === "A" && code === AMP.ACK && this.pendingAck === "setFolder") {
      this.pendingAck = null;
      this.amp.send("A", AMP.LIST_FIRST_ID, "list first ID");
      this.broadcast();
      return;
    }

    if (code === AMP.NAK || code === AMP.ERROR) {
      if (channel === "A" && this.folderLoad && this.tryNextFolderCandidate("Folder path rejected")) {
        this.broadcast();
        return;
      }

      this.inventory.loading = false;
      this.setStatus("error", `Tria returned ${code} on ${channel}`);
      this.broadcast();
      return;
    }

    if (code.endsWith("20") && code.startsWith("7") && payloadHex) {
      this.applyTransportStatus(channel, payloadHex);
      this.broadcast();
      return;
    }

    if ((code === "7404" || code === "740A" || code === "740B" || code === "740C") && payloadHex) {
      this.applyCurrentTime(channel, payloadHex);
      this.broadcast();
      return;
    }

    if (code === AMP.ID_LOADED_RETURN && payloadHex) {
      this.applyLoadedId(channel, payloadHex);
      this.broadcast();
      return;
    }

    if (code === AMP.NO_ID_LOADED_RETURN) {
      this.applyNoLoadedId(channel);
      this.broadcast();
      return;
    }

    if (code === AMP.ID_DURATION_RETURN && payloadHex) {
      this.applyDuration(channel, payloadHex);
      this.broadcast();
      return;
    }

    if (code === AMP.ID_DURATION_NOT_FOUND_RETURN) {
      const requestedPath = this.pendingDurationByChannel[channel];
      if (requestedPath) {
        this.failedDurationRequests.add(requestedPath);
        void this.logger.write("WARN", `Duration not found on ${channel}`, { commandId: requestedPath });
      }
      this.pendingDurationByChannel[channel] = null;
      this.pumpDurationQueue();
      this.broadcast();
      return;
    }

    if (channel !== "A") {
      return;
    }

    if ((code === AMP.LIST_FIRST_FOLDER_RETURN || code === AMP.LIST_NEXT_FOLDER_RETURN) && payloadHex) {
      const folders = decodeAmpNameList(payloadHex);
      for (const folder of folders) {
        if (!this.inventory.folders.some((entry) => entry.path === folder)) {
          this.inventory.folders.push({
            id: folder,
            name: folder || "root",
            path: folder
          });
        }
      }
      this.amp.send("A", AMP.LIST_NEXT_FOLDER, "list next folder");
      this.broadcast();
      return;
    }

    if (code === AMP.FOLDER_LIST_COMPLETE || code === AMP.BIN_LIST_COMPLETE) {
      const preferred = this.settings.workingFolder || this.inventory.selectedFolder || this.inventory.folders[0]?.path || "";
      if (preferred) {
        this.setInventoryFolder(preferred);
      } else {
        this.inventory.loading = false;
        this.setStatus("info", "Folder list complete");
        this.broadcast();
      }
      return;
    }

    if (code === AMP.ID_RETURN && payloadHex) {
      const clips = decodeAmpNameList(payloadHex).filter((name) => !isEmptyFolderMarker(name));
      const activeFolder = this.currentFolderCandidate();
      const targetClips = this.folderLoad?.clips ?? this.inventory.clips;
      for (const name of clips) {
        const fullPath = normalizeClipPath(activeFolder, name);
        const commandId = name;
        if (!targetClips.some((clip) => clip.fullPath === fullPath)) {
          targetClips.push({
            id: fullPath,
            name,
            folder: activeFolder,
            fullPath,
            commandId,
            online: true,
            duration: this.clipDurations.get(normalizeClipCommandId(commandId))
          });
          if (this.folderLoad) {
            this.folderLoad.currentClipCount += 1;
          }
        }
      }
      this.amp.send("A", AMP.LIST_NEXT_ID, "list next ID");
      this.broadcast();
      return;
    }

    if (code === AMP.NO_MORE_ID) {
      if (this.tryNextFolderCandidate("Folder empty")) {
        this.broadcast();
        return;
      }

      this.finalizeFolderLoad();
      this.inventory.loading = false;
      this.reconcilePlaylistOnline();
      this.queueInventoryDurations();
      this.setStatus("info", `Inventory loaded: ${this.inventory.clips.length} clips`);
      this.broadcast();
      return;
    }

    if (code === AMP.IDS_CHANGED_LIST_RETURN && payloadHex) {
      this.applyIdsChanged(payloadHex);
      this.broadcast();
    }
  }

  private currentFolderCandidate(): string {
    return this.folderLoad?.candidates[this.folderLoad.index] ?? this.inventory.selectedFolder;
  }

  private tryNextFolderCandidate(reason: string): boolean {
    if (!this.folderLoad || this.folderLoad.currentClipCount > 0) {
      return false;
    }

    if (this.folderLoad.index >= this.folderLoad.candidates.length - 1) {
      return false;
    }

    this.folderLoad.index += 1;
    const candidate = this.currentFolderCandidate();
    this.setStatus("info", `${reason}, probing ${candidate}`);
    this.sendCurrentFolderCandidate();
    return true;
  }

  private finalizeFolderLoad(): void {
    if (!this.folderLoad) {
      return;
    }

    const loadedFolder = this.currentFolderCandidate();
    const loadedClips = this.folderLoad.clips;
    if (this.folderLoad.currentClipCount > 0) {
      this.inventory.selectedFolder = loadedFolder;
      this.state = this.storage.saveState({
        ...this.state,
        selectedFolder: loadedFolder
      });

      if (!this.areInventoryClipsEqual(this.inventory.clips, loadedClips)) {
        this.inventory.clips = loadedClips;
      }

      if (!this.inventory.folders.some((entry) => entry.path.toLowerCase() === loadedFolder.toLowerCase())) {
        this.inventory.folders.push({
          id: loadedFolder,
          name: loadedFolder,
          path: loadedFolder
        });
      }
    } else if (!this.areInventoryClipsEqual(this.inventory.clips, [])) {
      this.inventory.clips = [];
    }

    this.folderLoad = null;
    this.pendingAck = null;
  }

  private areInventoryClipsEqual(left: InventoryClip[], right: InventoryClip[]): boolean {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((clip, index) => {
      const other = right[index];
      return (
        other &&
        clip.id === other.id &&
        clip.name === other.name &&
        clip.folder === other.folder &&
        clip.fullPath === other.fullPath &&
        clip.commandId === other.commandId &&
        clip.online === other.online
      );
    });
  }

  private applyTransportStatus(channel: ChannelId, payloadHex: string): void {
    const status = parseStatusSense(payloadHex);
    if (!status) {
      return;
    }

    const state = status.play ? "playing" : status.cueComplete || this.players[channel].currentClip ? "cued" : "idle";
    this.players[channel] = withReportedLoop(
      {
        ...this.players[channel],
        commandedLoop: this.commandedLoop[channel],
        state
      },
      status.loop
    );

    this.syncPlaylistChannelState(channel, state);
  }

  private applyCurrentTime(channel: ChannelId, payloadHex: string): void {
    const timecode = parseTimecodeHex(payloadHex);
    if (!timecode) {
      return;
    }
    if (!this.players[channel].loadedPath) {
      this.players[channel] = {
        ...this.players[channel],
        timecode: "--:--:--:--",
        remaining: "--:--:--:--"
      };
      return;
    }

    this.players[channel] = {
      ...this.players[channel],
      timecode,
      remaining: this.remainingFor(channel, timecode)
    };
  }

  private applyLoadedId(channel: ChannelId, payloadHex: string): void {
    const loaded = decodeAmpNameList(payloadHex)[0];
    if (!loaded) {
      this.applyNoLoadedId(channel);
      return;
    }

    const loadedId = normalizeLoadedId(loaded);
    const loadedCommandId = loadedId.commandId;
    const clipName = loadedId.clipName;
    const existing = this.players[channel];

    this.players[channel] = withCommandedLoop(
      {
        ...existing,
        currentClip: clipName,
        loadedPath: loadedCommandId,
        state: existing.state === "idle" ? "cued" : existing.state,
        remaining: this.remainingFor(channel, existing.timecode)
      },
      this.commandedLoop[channel]
    );

    if (!this.clipDurations.has(loadedCommandId)) {
      this.requestDuration(channel, loadedCommandId);
    }
    this.syncPlaylistChannelState(channel, this.players[channel].state);
  }

  private applyNoLoadedId(channel: ChannelId): void {
    this.players[channel] = withUnknownLoop({
      ...this.players[channel],
      currentClip: "",
      loadedPath: "",
      state: "idle",
      timecode: "--:--:--:--",
      remaining: "--:--:--:--"
    });
    this.commandedLoop[channel] = false;
    this.syncPlaylistChannelState(channel, "idle");
  }

  private applyDuration(channel: ChannelId, payloadHex: string): void {
    const requestedPath = this.pendingDurationByChannel[channel];
    const duration = parseTimecodeHex(payloadHex);
    this.pendingDurationByChannel[channel] = null;

    if (!requestedPath || !duration) {
      this.pumpDurationQueue();
      return;
    }

    this.clipDurations.set(requestedPath, duration);
    this.applyClipDuration(requestedPath, duration);
    if (this.players[channel].loadedPath === requestedPath) {
      this.players[channel] = {
        ...this.players[channel],
        remaining: this.remainingFor(channel, this.players[channel].timecode)
      };
    }
    this.pumpDurationQueue();
  }

  private applyClipDuration(commandId: string, duration: string): void {
    let changedInventory = false;
    this.inventory.clips = this.inventory.clips.map((clip) => {
      if (normalizeClipCommandId(clip.commandId) !== commandId || clip.duration === duration) {
        return clip;
      }

      changedInventory = true;
      return {
        ...clip,
        duration
      };
    });

    if (changedInventory) {
      this.state = this.storage.saveState(reconcilePlaylistDurations(this.state, this.inventory.clips));
    }
  }

  private syncPlaylistChannelState(channel: ChannelId, state: PlayerState["state"]): void {
    const loadedPath = this.players[channel].loadedPath;
    this.state = this.storage.saveState({
      ...this.state,
      playlist: this.state.playlist.map((item) => {
        if (item.assignedChannel !== channel) {
          return item;
        }

        if (!loadedPath || !commandIdsMatch(this.commandIdForItem(item), loadedPath)) {
          return item.state === "idle" ? item : { ...item, state: "idle" };
        }

        return { ...item, state };
      })
    });
  }

  private requestDuration(channel: ChannelId, commandId: string): void {
    const normalizedCommandId = normalizeClipCommandId(commandId);
    if (
      !normalizedCommandId ||
      !this.amp.isConnected(channel) ||
      this.clipDurations.has(normalizedCommandId) ||
      this.failedDurationRequests.has(normalizedCommandId)
    ) {
      return;
    }

    if (this.pendingDurationByChannel[channel] !== null) {
      if (this.pendingDurationByChannel[channel] !== normalizedCommandId && channel === "A") {
        this.enqueueDurationRequest(normalizedCommandId);
      }
      return;
    }

    this.pendingDurationByChannel[channel] = normalizedCommandId;
    this.amp.send(channel, buildAmpStringCommand(normalizedCommandId, AMP.ID_DURATION_REQUEST), `duration ${normalizedCommandId}`, {
      dedupeKey: `duration-${channel}`
    });
  }

  private sendWorkingBin(channel: ChannelId, reason: string): void {
    const folder = this.inventory.selectedFolder || this.settings.workingFolder;
    if (!folder || !this.amp.isConnected(channel) || this.workingBinSent[channel] === folder) {
      return;
    }

    const previousFolder = this.workingBinSent[channel];
    this.workingBinSent[channel] = folder;
    if (
      !this.amp.send(channel, buildAmpStringCommand(folder, AMP.SET_BIN), `set bin ${folder} (${reason})`, {
        dedupeKey: `set-bin-${channel}`
      })
    ) {
      this.workingBinSent[channel] = previousFolder;
    }
  }

  private applyConnectionStatus(summary: Record<ChannelId, { state: string }>): void {
    const connectedCount = CHANNELS.filter((channel) => summary[channel].state === "connected").length;
    const text = connectedCount === CHANNELS.length ? "Connected 4/4" : connectedCount > 0 ? `Connected ${connectedCount}/4` : "";
    if (!text || text === this.reportedConnectionText) {
      return;
    }

    if (this.status.text.startsWith("Connecting") || this.status.text.startsWith("Connected")) {
      this.reportedConnectionText = text;
      this.setStatus("info", text);
    }
  }

  private remainingFor(channel: ChannelId, currentTimecode: string): string {
    const loadedPath = this.players[channel].loadedPath;
    const duration = this.clipDurations.get(loadedPath);
    if (!duration || !currentTimecode || currentTimecode.startsWith("--")) {
      return "--:--:--:--";
    }

    const durationFrames = timecodeToFrames(duration, this.settings.frameRate);
    const currentFrames = timecodeToFrames(currentTimecode, this.settings.frameRate);
    if (durationFrames === null || currentFrames === null) {
      return "--:--:--:--";
    }

    return framesToTimecode(durationFrames - currentFrames, this.settings.frameRate);
  }

  private commandIdForItem(item: (typeof this.state.playlist)[number]): string {
    return normalizeClipCommandId(item.commandId || item.clipName || item.fullPath);
  }

  private applyIdsChanged(payloadHex: string): void {
    const events = parseIdsChangedPayload(payloadHex);
    for (const event of events) {
      if (event.folder !== this.inventory.selectedFolder) {
        continue;
      }

      const fullPath = normalizeClipPath(event.folder, event.clipName);
      if (event.type === "add" && !this.inventory.clips.some((clip) => clip.fullPath === fullPath)) {
        this.inventory.clips.push({
          id: fullPath,
          name: event.clipName,
          folder: event.folder,
          fullPath,
          commandId: event.clipName,
          online: true,
          duration: this.clipDurations.get(normalizeClipCommandId(event.clipName))
        });
        this.enqueueDurationRequest(event.clipName);
        this.setStatus("info", `Clip added: ${event.clipName}`);
      }

      if (event.type === "remove") {
        this.inventory.clips = this.inventory.clips.filter((clip) => clip.fullPath !== fullPath);
        this.setStatus("warn", `Clip removed: ${event.clipName}`);
      }
    }
    this.reconcilePlaylistOnline();
    this.queueInventoryDurations();
  }

  private queueInventoryDurations(): void {
    for (const clip of this.inventory.clips) {
      const cachedDuration = this.clipDurations.get(normalizeClipCommandId(clip.commandId));
      if (cachedDuration && clip.duration !== cachedDuration) {
        this.applyClipDuration(normalizeClipCommandId(clip.commandId), cachedDuration);
        continue;
      }
      if (!clip.duration) {
        this.enqueueDurationRequest(clip.commandId);
      }
    }
    this.pumpDurationQueue();
  }

  private enqueueDurationRequest(commandId: string): void {
    const normalizedCommandId = normalizeClipCommandId(commandId);
    if (
      !normalizedCommandId ||
      this.clipDurations.has(normalizedCommandId) ||
      this.failedDurationRequests.has(normalizedCommandId) ||
      this.durationQueue.includes(normalizedCommandId) ||
      Object.values(this.pendingDurationByChannel).includes(normalizedCommandId)
    ) {
      return;
    }

    this.durationQueue.push(normalizedCommandId);
  }

  private pumpDurationQueue(): void {
    if (!this.amp.isConnected("A") || this.pendingDurationByChannel.A) {
      return;
    }

    while (this.durationQueue.length > 0) {
      const commandId = this.durationQueue.shift();
      if (!commandId || this.clipDurations.has(commandId) || this.failedDurationRequests.has(commandId)) {
        continue;
      }

      this.requestDuration("A", commandId);
      return;
    }
  }

  private reconcilePlaylistOnline(): void {
    const onlinePaths = new Set(this.inventory.clips.flatMap((clip) => [clip.fullPath, clip.commandId, `${clip.folder}/${clip.name}`]));
    this.state = this.storage.saveState(reconcileOnlineState(this.state, onlinePaths));
  }

  private currentTallySourceId: number | null = null;

  private syncTallyListener(): void {
    if (!this.settings.tallyEnabled) {
      this.tally?.stop();
      this.applyTallySource(null);
      this.tallyRuntime = {
        ...this.tallyRuntime,
        enabled: false,
        listening: false,
        clientCount: 0,
        port: this.settings.tallyPort,
        lastMessage: "TSL disabled"
      };
      return;
    }

    this.tallyRuntime = {
      ...this.tallyRuntime,
      enabled: true,
      port: this.settings.tallyPort
    };
    this.tally?.start(this.settings);
  }

  private handleTallySource(sourceId: number, text: string, state: "on-air" | "off-air", kind: "update" | "sync-message"): void {
    if (state === "on-air") {
      this.applyTallySource(sourceId);
    }
    const channel = this.channelForTallySource(sourceId);
    if (!channel) {
      if (state === "on-air") {
        this.broadcast();
      }
      return;
    }

    const message = {
      at: new Date().toISOString(),
      sourceId,
      channel,
      state,
      kind,
      text
    };
    this.tallyRuntime = {
      ...this.tallyRuntime,
      recentMessages: [message, ...this.tallyRuntime.recentMessages].slice(0, 60)
    };
    void this.logger.write("RX", "Relevant TSL source", message);
    this.broadcast();
  }

  private channelForTallySource(sourceId: number): ChannelId | null {
    return CHANNELS.find((channel) => this.settings.tallyChannelIds[channel] === sourceId) ?? null;
  }

  private applyTallySource(sourceId: number | null): void {
    this.currentTallySourceId = sourceId;
    for (const channel of CHANNELS) {
      const onAir = sourceId !== null && this.settings.tallyChannelIds[channel] === sourceId;
      if (this.players[channel].onAir !== onAir) {
        this.players[channel] = {
          ...this.players[channel],
          onAir
        };
      }
    }
  }

  private getInhibitReason(item: (typeof this.state.playlist)[number] | undefined): string | null {
    if (!item) {
      return "No clip selected";
    }
    if (!item.online) {
      return `Cue/play inhibited: ${item.clipName} is offline`;
    }
    if (!item.assignedChannel) {
      return `Cue/play inhibited: ${item.clipName} has no channel assignment`;
    }
    if (!this.amp.isConnected(item.assignedChannel)) {
      return `Cue/play inhibited: channel ${item.assignedChannel} is not connected`;
    }
    return null;
  }

  private startPolling(): void {
    this.stopPolling();
    this.idChangePollTimer = setInterval(() => {
      if (this.amp.isConnected("A") && !this.inventory.loading) {
        this.amp.send("A", AMP.IDS_CHANGED_LIST_REQUEST, "IDs changed request", {
          dedupeKey: "ids-changed"
        });
      }
    }, this.settings.idChangePollMs);

    this.inventoryRefreshTimer = setInterval(() => {
      if (this.amp.isConnected("A") && !this.inventory.loading && this.amp.queueSize("A") < 5) {
        this.refreshInventory();
      }
    }, this.settings.inventoryFullRefreshMs);

    this.transportPollTimer = setInterval(() => {
      this.currentIdPollCounter = (this.currentIdPollCounter + 1) % 4;
      for (const channel of CHANNELS) {
        if (!this.amp.isConnected(channel) || this.amp.queueSize(channel) > 8) {
          continue;
        }

        this.amp.send(channel, AMP.STATUS_SENSE_ALL, `status ${channel}`, {
          dedupeKey: `status-${channel}`
        });
        this.amp.send(channel, AMP.CURRENT_TIME_TIMER, `timecode ${channel}`, {
          dedupeKey: `timecode-${channel}`
        });

        if (this.currentIdPollCounter === 0) {
          this.amp.send(channel, AMP.ID_LOADED_REQUEST, `loaded ID ${channel}`, {
            dedupeKey: `loaded-id-${channel}`
          });
        }
      }
    }, this.settings.transportPollMs);
  }

  private stopPolling(): void {
    if (this.idChangePollTimer) {
      clearInterval(this.idChangePollTimer);
      this.idChangePollTimer = null;
    }
    if (this.inventoryRefreshTimer) {
      clearInterval(this.inventoryRefreshTimer);
      this.inventoryRefreshTimer = null;
    }
    if (this.transportPollTimer) {
      clearInterval(this.transportPollTimer);
      this.transportPollTimer = null;
    }
  }

  private setStatus(level: StatusMessage["level"], text: string): void {
    this.status = {
      level,
      text,
      at: new Date().toISOString()
    };
    void this.logger.write(level === "error" ? "ERROR" : level === "warn" ? "WARN" : "INFO", text);
  }

  private snapshotAndBroadcast(): AppSnapshot {
    const snapshot = this.snapshot();
    this.broadcast(snapshot);
    return snapshot;
  }

  private broadcast(snapshot = this.snapshot()): void {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send("app:snapshot", snapshot);
    }
  }
}
