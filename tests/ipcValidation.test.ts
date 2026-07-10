import { describe, expect, it } from "vitest";
import { sanitizePersistedState, sanitizeSettings } from "../src/main/ipcValidation.js";
import { defaultSettings } from "../src/main/storage.js";

describe("IPC validation", () => {
  it("sanitizes malformed settings without trusting renderer input", () => {
    expect(
      sanitizeSettings({
        triaIp: "  ",
        port: "3812",
        workingFolder: " IMPORTS ",
        transportPollMs: "750",
        shortClipThresholdSeconds: "12",
        tallyEnabled: false,
        tallyPort: "9000",
        tallyChannelIds: {
          A: "10",
          B: -1,
          C: "nope"
        },
        onAirGuardEnabled: false,
        loggingLevel: "debug",
        shortcuts: {
          play: "",
          cue: "NumpadEnter"
        }
      })
    ).toMatchObject({
      triaIp: defaultSettings.triaIp,
      port: 3812,
      workingFolder: "IMPORTS",
      transportPollMs: 750,
      shortClipThresholdSeconds: 12,
      tallyEnabled: false,
      tallyPort: 9000,
      tallyChannelIds: {
        A: 10,
        B: 0,
        C: defaultSettings.tallyChannelIds.C,
        D: defaultSettings.tallyChannelIds.D
      },
      onAirGuardEnabled: false,
      loggingLevel: "debug",
      shortcuts: {
        play: defaultSettings.shortcuts.play,
        cue: "NumpadEnter"
      }
    });
  });

  it("clamps short clip threshold to zero or higher", () => {
    expect(sanitizeSettings({ shortClipThresholdSeconds: -5, tallyPort: -12, loggingLevel: "verbose" })).toMatchObject({
      shortClipThresholdSeconds: 0,
      tallyPort: defaultSettings.tallyPort,
      tallyEnabled: true,
      onAirGuardEnabled: true,
      loggingLevel: "normal"
    });
  });

  it("drops malformed playlist items and invalid channel IDs", () => {
    expect(
      sanitizePersistedState({
        selectedItemId: "kept",
        selectedFolder: " IMPORTS ",
        playlist: [
          { id: "kept", clipName: "TEST", assignedChannel: "Z", state: "playing" },
          { id: "", clipName: "NOPE" }
        ]
      })
    ).toMatchObject({
      selectedItemId: "kept",
      selectedFolder: "IMPORTS",
      playlist: [
        {
          id: "kept",
          clipName: "TEST",
          commandId: "TEST",
          duration: undefined,
          assignedChannel: null,
          state: "playing"
        }
      ]
    });
  });
});
