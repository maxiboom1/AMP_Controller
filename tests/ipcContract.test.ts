import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const expectedChannels = [
  "app:getSnapshot",
  "app:saveSettings",
  "app:connect",
  "app:disconnect",
  "app:refreshInventory",
  "app:setInventoryFolder",
  "app:saveState",
  "app:cueItem",
  "app:playItem",
  "app:playChannel",
  "app:pauseChannel",
  "app:ejectChannel",
  "app:setLoop",
  "app:setChannelLoop",
  "app:notify",
  "app:clearTallyMessages",
  "app:openLogsFolder"
];

describe("IPC contract", () => {
  it("keeps main/preload channel names stable", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const preload = readFileSync(join(here, "../src/preload/preload.ts"), "utf8");
    const main = readFileSync(join(here, "../src/main/appController.ts"), "utf8");
    const ipc = readFileSync(join(here, "../src/main/ipcHandlers.ts"), "utf8");
    const source = `${preload}\n${main}\n${ipc}`;

    for (const channel of expectedChannels) {
      expect(source).toContain(channel);
    }
  });
});
