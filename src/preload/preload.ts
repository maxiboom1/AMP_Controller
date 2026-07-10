import { contextBridge, ipcRenderer } from "electron";
import type { AppApi, AppSettings, AppSnapshot, ChannelId, PersistedState } from "../shared/types.js";

const api: AppApi = {
  getSnapshot: () => ipcRenderer.invoke("app:getSnapshot"),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke("app:saveSettings", settings),
  connect: () => ipcRenderer.invoke("app:connect"),
  disconnect: () => ipcRenderer.invoke("app:disconnect"),
  refreshInventory: () => ipcRenderer.invoke("app:refreshInventory"),
  setInventoryFolder: (folder: string) => ipcRenderer.invoke("app:setInventoryFolder", folder),
  saveState: (state: PersistedState) => ipcRenderer.invoke("app:saveState", state),
  cueItem: (itemId: string) => ipcRenderer.invoke("app:cueItem", itemId),
  playItem: (itemId: string) => ipcRenderer.invoke("app:playItem", itemId),
  playChannel: (channel: ChannelId) => ipcRenderer.invoke("app:playChannel", channel),
  pauseChannel: (channel: ChannelId) => ipcRenderer.invoke("app:pauseChannel", channel),
  ejectChannel: (channel: ChannelId) => ipcRenderer.invoke("app:ejectChannel", channel),
  setLoop: (itemId: string, enabled: boolean) => ipcRenderer.invoke("app:setLoop", itemId, enabled),
  setChannelLoop: (channel: ChannelId, enabled: boolean) => ipcRenderer.invoke("app:setChannelLoop", channel, enabled),
  notify: (text: string) => ipcRenderer.invoke("app:notify", text),
  clearTallyMessages: () => ipcRenderer.invoke("app:clearTallyMessages"),
  openLogsFolder: () => ipcRenderer.invoke("app:openLogsFolder"),
  onSnapshot: (callback: (snapshot: AppSnapshot) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: AppSnapshot) => callback(snapshot);
    ipcRenderer.on("app:snapshot", listener);
    return () => ipcRenderer.off("app:snapshot", listener);
  },
  onMenuAction: (callback: (action: "settings") => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: "settings") => callback(action);
    ipcRenderer.on("menu:action", listener);
    return () => ipcRenderer.off("menu:action", listener);
  }
};

contextBridge.exposeInMainWorld("tria", api);
