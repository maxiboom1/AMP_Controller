import { ipcMain } from "electron";
import type { AppSnapshot } from "../shared/types.js";

export interface AppIpcController {
  snapshot: () => AppSnapshot;
  saveSettings: (settings: unknown) => AppSnapshot;
  connect: () => AppSnapshot;
  disconnect: () => AppSnapshot;
  refreshInventory: () => AppSnapshot;
  setInventoryFolder: (folder: unknown) => AppSnapshot;
  saveState: (state: unknown) => AppSnapshot;
  cueItem: (itemId: unknown) => AppSnapshot;
  playItem: (itemId: unknown) => AppSnapshot;
  playChannel: (channel: unknown) => AppSnapshot;
  pauseChannel: (channel: unknown) => AppSnapshot;
  ejectChannel: (channel: unknown) => AppSnapshot;
  setLoop: (itemId: unknown, enabled: unknown) => AppSnapshot;
  setChannelLoop: (channel: unknown, enabled: unknown) => AppSnapshot;
  notify: (text: unknown) => AppSnapshot;
  clearTallyMessages: () => AppSnapshot;
  openLogsFolder: () => Promise<string>;
}

export function installAppIpc(controller: AppIpcController): void {
  ipcMain.handle("app:getSnapshot", () => controller.snapshot());
  ipcMain.handle("app:saveSettings", async (_event, settings: unknown) => controller.saveSettings(settings));
  ipcMain.handle("app:connect", async () => controller.connect());
  ipcMain.handle("app:disconnect", async () => controller.disconnect());
  ipcMain.handle("app:refreshInventory", async () => controller.refreshInventory());
  ipcMain.handle("app:setInventoryFolder", async (_event, folder: unknown) => controller.setInventoryFolder(folder));
  ipcMain.handle("app:saveState", async (_event, state: unknown) => controller.saveState(state));
  ipcMain.handle("app:cueItem", async (_event, itemId: unknown) => controller.cueItem(itemId));
  ipcMain.handle("app:playItem", async (_event, itemId: unknown) => controller.playItem(itemId));
  ipcMain.handle("app:playChannel", async (_event, channel: unknown) => controller.playChannel(channel));
  ipcMain.handle("app:pauseChannel", async (_event, channel: unknown) => controller.pauseChannel(channel));
  ipcMain.handle("app:ejectChannel", async (_event, channel: unknown) => controller.ejectChannel(channel));
  ipcMain.handle("app:setLoop", async (_event, itemId: unknown, enabled: unknown) => controller.setLoop(itemId, enabled));
  ipcMain.handle("app:setChannelLoop", async (_event, channel: unknown, enabled: unknown) => controller.setChannelLoop(channel, enabled));
  ipcMain.handle("app:notify", async (_event, text: unknown) => controller.notify(text));
  ipcMain.handle("app:clearTallyMessages", async () => controller.clearTallyMessages());
  ipcMain.handle("app:openLogsFolder", async () => controller.openLogsFolder());
}
