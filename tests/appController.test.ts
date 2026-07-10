import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AMP, buildAmpStringCommand } from "../src/main/amp/ampProtocol.js";
import { AppController } from "../src/main/appController.js";
import { defaultPlayerState } from "../src/main/playerState.js";
import type { AppSettings, ChannelId, PersistedState } from "../src/shared/types.js";

vi.mock("electron", () => ({
  app: {
    getVersion: () => "test"
  },
  BrowserWindow: {
    getAllWindows: () => []
  },
  ipcMain: {
    handle: vi.fn()
  }
}));

const settings: AppSettings = {
  triaIp: "192.168.1.100",
  port: 3811,
  workingFolder: "IMPORTS",
  idChangePollMs: 6000,
  inventoryFullRefreshMs: 30000,
  transportPollMs: 500,
  frameRate: 25,
  shortClipThresholdSeconds: 10,
  tallyEnabled: true,
  tallyPort: 8900,
  tallyChannelIds: {
    A: 6,
    B: 7,
    C: 8,
    D: 9
  },
  onAirGuardEnabled: true,
  loggingLevel: "normal",
  shortcuts: {
    play: "Space",
    cue: "Enter",
    loop: "KeyL",
    assignA: "Digit1",
    assignB: "Digit2",
    assignC: "Digit3",
    assignD: "Digit4"
  }
};

class FakeAmp extends EventEmitter {
  sent: Array<{ channel: ChannelId; command: string; label: string }> = [];
  connected = new Set<ChannelId>(["A", "B", "C", "D"]);

  send(channel: ChannelId, command: string, label = command.trim()): boolean {
    this.sent.push({ channel, command, label });
    return true;
  }

  isConnected(channel: ChannelId): boolean {
    return this.connected.has(channel);
  }

  connect(): void {
    return undefined;
  }

  disconnect(): void {
    return undefined;
  }

  queueSize(): number {
    return 0;
  }
}

class FakeTally extends EventEmitter {
  start = vi.fn();
  stop = vi.fn();
}

function createController(
  state: PersistedState,
  options: { settings?: Partial<AppSettings>; tally?: FakeTally } = {}
): {
  controller: AppController;
  amp: FakeAmp;
  logger: { setLevel: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };
  tally?: FakeTally;
} {
  const amp = new FakeAmp();
  const currentSettings = {
    ...settings,
    ...options.settings,
    shortcuts: {
      ...settings.shortcuts,
      ...options.settings?.shortcuts
    },
    tallyChannelIds: {
      ...settings.tallyChannelIds,
      ...options.settings?.tallyChannelIds
    }
  };
  const storage = {
    getSettings: () => currentSettings,
    saveSettings: (next: AppSettings) => next,
    getState: () => state,
    saveState: (next: PersistedState) => {
      state = next;
      return next;
    }
  };
  const logger = {
    setLevel: vi.fn(),
    write: vi.fn(async () => undefined),
    openFolder: vi.fn(async () => "")
  };

  return {
    controller: new AppController(storage as never, amp as never, logger as never, options.tally as never),
    amp,
    logger,
    tally: options.tally
  };
}

describe("AppController transport state", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("queues cue before play when playing an idle item", () => {
    const { controller, amp } = createController({
      selectedFolder: "IMPORTS",
      selectedItemId: "1",
      playlist: [
        {
          id: "1",
          clipName: "TEST",
          folder: "IMPORTS",
          fullPath: "V:/IMPORTS/TEST",
          commandId: "TEST",
          online: true,
          loop: false,
          assignedChannel: "A",
          state: "idle"
        }
      ]
    });

    controller.playItem("1");
    expect(amp.sent.map((entry) => entry.label).slice(0, 2)).toEqual(["cue TEST", "play TEST"]);
    expect(amp.sent.map((entry) => entry.label)).toContain("duration TEST");
    expect(controller.snapshot().state.playlist[0]).toMatchObject({ state: "playing" });
  });

  it("inhibits offline cue without sending AMP commands", () => {
    const { controller, amp } = createController({
      selectedFolder: "IMPORTS",
      selectedItemId: "1",
      playlist: [
        {
          id: "1",
          clipName: "TEST",
          folder: "IMPORTS",
          fullPath: "V:/IMPORTS/TEST",
          commandId: "TEST",
          online: false,
          loop: false,
          assignedChannel: "A",
          state: "idle"
        }
      ]
    });

    controller.cueItem("1");
    expect(amp.sent).toEqual([]);
    expect(controller.snapshot().status).toMatchObject({ level: "warn" });
  });

  it("eject clears channel playlist states", () => {
    const { controller } = createController({
      selectedFolder: "IMPORTS",
      selectedItemId: "1",
      playlist: [
        {
          id: "1",
          clipName: "ONE",
          folder: "IMPORTS",
          fullPath: "V:/IMPORTS/ONE",
          commandId: "ONE",
          online: true,
          loop: false,
          assignedChannel: "A",
          state: "playing"
        },
        {
          id: "2",
          clipName: "TWO",
          folder: "IMPORTS",
          fullPath: "V:/IMPORTS/TWO",
          commandId: "TWO",
          online: true,
          loop: false,
          assignedChannel: "A",
          state: "cued"
        }
      ]
    });

    controller.ejectChannel("A");
    expect(controller.snapshot().state.playlist.map((item) => item.state)).toEqual(["idle", "idle"]);
  });

  it("normalizes loaded IDs before duration requests and suppresses retries after 8017", () => {
    const { controller, amp } = createController({
      selectedFolder: "IMPORTS",
      selectedItemId: null,
      playlist: []
    });
    const controllerInternals = controller as unknown as {
      handleAmpMessage: (channel: ChannelId, code: string, payloadHex?: string) => void;
      players: Record<ChannelId, ReturnType<typeof defaultPlayerState>>;
    };

    controllerInternals.handleAmpMessage("A", AMP.ID_LOADED_RETURN, "000D5C494D504F5254535C54455354");

    expect(controller.snapshot().players.A).toMatchObject({
      currentClip: "TEST",
      loadedPath: "TEST"
    });
    expect(amp.sent.at(-1)).toMatchObject({
      channel: "A",
      label: "duration TEST",
      command: buildAmpStringCommand("TEST", AMP.ID_DURATION_REQUEST)
    });

    controllerInternals.handleAmpMessage("A", AMP.ID_DURATION_NOT_FOUND_RETURN);
    controllerInternals.handleAmpMessage("A", AMP.ID_LOADED_RETURN, "000454455354");

    expect(amp.sent.filter((entry) => entry.label === "duration TEST")).toHaveLength(1);
  });

  it("queues inventory duration requests and applies returned durations to inventory and playlist", () => {
    const { controller, amp } = createController({
      selectedFolder: "IMPORTS",
      selectedItemId: "1",
      playlist: [
        {
          id: "1",
          clipName: "ONE",
          folder: "IMPORTS",
          fullPath: "V:/IMPORTS/ONE",
          commandId: "ONE",
          online: true,
          loop: false,
          assignedChannel: null,
          state: "idle"
        }
      ]
    });
    const controllerInternals = controller as unknown as {
      handleAmpMessage: (channel: ChannelId, code: string, payloadHex?: string) => void;
    };

    controllerInternals.handleAmpMessage("A", AMP.ID_RETURN, "00034F4E45000354574F");
    controllerInternals.handleAmpMessage("A", AMP.NO_MORE_ID);

    expect(amp.sent.filter((entry) => entry.label.startsWith("duration ")).map((entry) => entry.label)).toEqual(["duration ONE"]);

    controllerInternals.handleAmpMessage("A", AMP.ID_DURATION_RETURN, "05000000");

    expect(controller.snapshot().inventory.clips[0]).toMatchObject({ name: "ONE", duration: "00:00:00:05" });
    expect(controller.snapshot().state.playlist[0]).toMatchObject({ clipName: "ONE", duration: "00:00:00:05" });
    expect(amp.sent.filter((entry) => entry.label.startsWith("duration ")).map((entry) => entry.label)).toEqual([
      "duration ONE",
      "duration TWO"
    ]);
  });

  it("marks the channel matching the current TSL source as on-air", () => {
    const { controller } = createController({
      selectedFolder: "IMPORTS",
      selectedItemId: null,
      playlist: []
    });
    const controllerInternals = controller as unknown as {
      applyTallySource: (sourceId: number | null) => void;
    };

    controllerInternals.applyTallySource(8);

    expect(controller.snapshot().players.A.onAir).toBe(false);
    expect(controller.snapshot().players.C.onAir).toBe(true);

    controllerInternals.applyTallySource(6);

    expect(controller.snapshot().players.A.onAir).toBe(true);
    expect(controller.snapshot().players.C.onAir).toBe(false);
  });

  it("allows list cue while a channel is on-air", () => {
    const { controller, amp } = createController({
      selectedFolder: "IMPORTS",
      selectedItemId: "1",
      playlist: [
        {
          id: "1",
          clipName: "ONE",
          folder: "IMPORTS",
          fullPath: "V:/IMPORTS/ONE",
          commandId: "ONE",
          online: true,
          loop: false,
          assignedChannel: "A",
          state: "idle"
        }
      ]
    });
    const controllerInternals = controller as unknown as {
      applyTallySource: (sourceId: number | null) => void;
    };

    controllerInternals.applyTallySource(6);
    controller.cueItem("1");

    expect(amp.sent.map((entry) => entry.label)).toContain("cue ONE");
    expect(controller.snapshot().state.playlist[0]).toMatchObject({ state: "cued" });
  });

  it("allows list play while a channel is on-air", () => {
    const { controller, amp } = createController({
      selectedFolder: "IMPORTS",
      selectedItemId: "1",
      playlist: [
        {
          id: "1",
          clipName: "ONE",
          folder: "IMPORTS",
          fullPath: "V:/IMPORTS/ONE",
          commandId: "ONE",
          online: true,
          loop: false,
          assignedChannel: "A",
          state: "idle"
        }
      ]
    });
    const controllerInternals = controller as unknown as {
      applyTallySource: (sourceId: number | null) => void;
      players: Record<ChannelId, ReturnType<typeof defaultPlayerState>>;
    };

    controllerInternals.applyTallySource(6);
    controllerInternals.players.A = {
      ...controllerInternals.players.A,
      currentClip: "ONE",
      loadedPath: "ONE"
    };

    controller.playItem("1");

    expect(amp.sent.map((entry) => entry.label)).toEqual(["cue ONE", "play ONE", "duration ONE"]);
    expect(controller.snapshot().state.playlist[0]).toMatchObject({ state: "playing" });
  });

  it("allows list play to cue and play a different idle line while on-air", () => {
    const { controller, amp } = createController({
      selectedFolder: "IMPORTS",
      selectedItemId: "2",
      playlist: [
        {
          id: "2",
          clipName: "TWO",
          folder: "IMPORTS",
          fullPath: "V:/IMPORTS/TWO",
          commandId: "TWO",
          online: true,
          loop: false,
          assignedChannel: "A",
          state: "idle"
        }
      ]
    });
    const controllerInternals = controller as unknown as {
      applyTallySource: (sourceId: number | null) => void;
      players: Record<ChannelId, ReturnType<typeof defaultPlayerState>>;
    };

    controllerInternals.applyTallySource(6);
    controllerInternals.players.A = {
      ...controllerInternals.players.A,
      currentClip: "ONE",
      loadedPath: "ONE"
    };

    controller.playItem("2");

    expect(amp.sent.map((entry) => entry.label)).toEqual(["cue TWO", "play TWO", "duration TWO"]);
    expect(controller.snapshot().state.playlist[0]).toMatchObject({ state: "playing" });
  });

  it("allows list cue and play when OnAir Guard is disabled", () => {
    const { controller, amp } = createController(
      {
        selectedFolder: "IMPORTS",
        selectedItemId: "1",
        playlist: [
          {
            id: "1",
            clipName: "ONE",
            folder: "IMPORTS",
            fullPath: "V:/IMPORTS/ONE",
            commandId: "ONE",
            online: true,
            loop: false,
            assignedChannel: "A",
            state: "idle"
          }
        ]
      },
      { settings: { onAirGuardEnabled: false } }
    );
    const controllerInternals = controller as unknown as {
      applyTallySource: (sourceId: number | null) => void;
    };

    controllerInternals.applyTallySource(6);
    controller.cueItem("1");
    controller.playItem("1");

    expect(amp.sent.map((entry) => entry.label)).toContain("cue ONE");
    expect(amp.sent.map((entry) => entry.label)).toContain("play ONE");
  });

  it("keeps manual channel controls available while the channel is on-air", () => {
    const { controller, amp } = createController({
      selectedFolder: "IMPORTS",
      selectedItemId: null,
      playlist: []
    });
    const controllerInternals = controller as unknown as {
      applyTallySource: (sourceId: number | null) => void;
    };

    controllerInternals.applyTallySource(6);
    controller.playChannel("A");
    controller.pauseChannel("A");
    controller.setChannelLoop("A", true);
    controller.ejectChannel("A");

    expect(amp.sent.map((entry) => entry.label)).toEqual(["play A", "pause A", "loop A on", "verify loop A", "eject A"]);
  });

  it("starts and stops the TSL listener from settings", () => {
    const tally = new FakeTally();
    const { controller } = createController(
      {
        selectedFolder: "IMPORTS",
        selectedItemId: null,
        playlist: []
      },
      { tally }
    );

    expect(tally.start).toHaveBeenCalledTimes(1);
    expect(controller.snapshot().tally.enabled).toBe(true);

    controller.saveSettings({ ...settings, tallyEnabled: false });

    expect(tally.stop).toHaveBeenCalledTimes(1);
    expect(controller.snapshot().tally).toMatchObject({
      enabled: false,
      listening: false,
      clientCount: 0
    });
  });

  it("tracks TSL client status and keeps only relevant incoming messages", () => {
    const tally = new FakeTally();
    const { controller } = createController(
      {
        selectedFolder: "IMPORTS",
        selectedItemId: null,
        playlist: []
      },
      { tally }
    );

    tally.emit("status", {
      listening: true,
      clientCount: 1,
      port: 8900,
      text: "TSL connected"
    });
    tally.emit("source", 32, "032:OTHER", "on-air", "sync-message");
    tally.emit("source", 6, "006:VTR-A", "on-air", "update");
    tally.emit("source", 7, "VTR-B", "off-air", "sync-message");

    expect(controller.snapshot().tally).toMatchObject({
      enabled: true,
      listening: true,
      clientCount: 1
    });
    expect(controller.snapshot().tally.recentMessages).toEqual([
      expect.objectContaining({
        channel: "B",
        sourceId: 7,
        state: "off-air",
        kind: "sync-message",
        text: "VTR-B"
      }),
      expect.objectContaining({
        channel: "A",
        sourceId: 6,
        state: "on-air",
        kind: "update",
        text: "006:VTR-A"
      })
    ]);
    expect(controller.snapshot().players.A.onAir).toBe(true);
  });

  it("clears live TSL messages without changing tally settings", () => {
    const tally = new FakeTally();
    const { controller } = createController(
      {
        selectedFolder: "IMPORTS",
        selectedItemId: null,
        playlist: []
      },
      { tally }
    );

    tally.emit("source", 6, "006:VTR-A", "on-air", "update");
    expect(controller.snapshot().tally.recentMessages).toHaveLength(1);

    controller.clearTallyMessages();

    expect(controller.snapshot().tally.recentMessages).toEqual([]);
    expect(controller.snapshot().settings.tallyEnabled).toBe(true);
  });

  it("logs parsed AMP messages only in debug logging mode", () => {
    const { amp, logger } = createController({
      selectedFolder: "IMPORTS",
      selectedItemId: null,
      playlist: []
    });

    amp.emit("message", "A", { code: AMP.ACK, kind: "ack", raw: "1001" });

    expect(logger.write).not.toHaveBeenCalledWith("INFO", expect.stringContaining("Parsed AMP"), expect.anything());

    const debug = createController(
      {
        selectedFolder: "IMPORTS",
        selectedItemId: null,
        playlist: []
      },
      { settings: { loggingLevel: "debug" } }
    );

    debug.amp.emit("message", "A", { code: AMP.ACK, kind: "ack", raw: "1001" });

    expect(debug.logger.write).toHaveBeenCalledWith("INFO", "Parsed AMP 1001 on A", expect.objectContaining({ raw: "1001" }));
  });
});
