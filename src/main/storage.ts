import Store from "electron-store";
import type { AppSettings, PersistedState } from "../shared/types.js";

export const defaultSettings: AppSettings = {
  triaIp: "192.168.1.100",
  port: 3811,
  workingFolder: "",
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

export const defaultState: PersistedState = {
  playlist: [],
  selectedItemId: null,
  selectedFolder: ""
};

interface StoreShape {
  settings: AppSettings;
  state: PersistedState;
}

export class AppStorage {
  private store = new Store<StoreShape>({
    name: "tria-controller",
    defaults: {
      settings: defaultSettings,
      state: defaultState
    }
  });

  getSettings(): AppSettings {
    const storedSettings = this.store.get("settings");
    const storedTallyIds = storedSettings.tallyChannelIds;
    const tallyChannelIds =
      storedTallyIds?.A === 1 && storedTallyIds.B === 2 && storedTallyIds.C === 3 && storedTallyIds.D === 4
        ? defaultSettings.tallyChannelIds
        : {
            ...defaultSettings.tallyChannelIds,
            ...storedTallyIds
          };

    return {
      ...defaultSettings,
      ...storedSettings,
      shortcuts: {
        ...defaultSettings.shortcuts,
        ...storedSettings.shortcuts
      },
      tallyChannelIds
    };
  }

  saveSettings(settings: AppSettings): AppSettings {
    const tallyPort = Number(settings.tallyPort);
    const next: AppSettings = {
      ...defaultSettings,
      ...settings,
      port: Number(settings.port) || defaultSettings.port,
      idChangePollMs: Math.max(1000, Number(settings.idChangePollMs) || defaultSettings.idChangePollMs),
      inventoryFullRefreshMs: Math.max(5000, Number(settings.inventoryFullRefreshMs) || defaultSettings.inventoryFullRefreshMs),
      transportPollMs: Math.max(250, Number(settings.transportPollMs) || defaultSettings.transportPollMs),
      frameRate: Math.max(1, Number(settings.frameRate) || defaultSettings.frameRate),
      shortClipThresholdSeconds: Math.max(0, Number(settings.shortClipThresholdSeconds) || 0),
      tallyEnabled: settings.tallyEnabled !== false,
      tallyPort: tallyPort > 0 ? tallyPort : defaultSettings.tallyPort,
      onAirGuardEnabled: settings.onAirGuardEnabled !== false,
      loggingLevel: settings.loggingLevel === "debug" ? "debug" : "normal",
      shortcuts: {
        ...defaultSettings.shortcuts,
        ...settings.shortcuts
      },
      tallyChannelIds: {
        A: Math.max(0, Number(settings.tallyChannelIds?.A) || defaultSettings.tallyChannelIds.A),
        B: Math.max(0, Number(settings.tallyChannelIds?.B) || defaultSettings.tallyChannelIds.B),
        C: Math.max(0, Number(settings.tallyChannelIds?.C) || defaultSettings.tallyChannelIds.C),
        D: Math.max(0, Number(settings.tallyChannelIds?.D) || defaultSettings.tallyChannelIds.D)
      }
    };
    this.store.set("settings", next);
    return next;
  }

  getState(): PersistedState {
    return {
      ...defaultState,
      ...this.store.get("state")
    };
  }

  saveState(state: PersistedState): PersistedState {
    this.store.set("state", state);
    return state;
  }
}
