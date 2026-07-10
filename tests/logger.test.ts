import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppLogger } from "../src/main/logger.js";

vi.mock("electron", () => ({
  app: {
    getPath: () => ""
  },
  shell: {
    openPath: vi.fn(async () => "")
  }
}));

let logDir = "";

async function readLogLines(): Promise<string[]> {
  const files = await readdir(logDir);
  if (files.length === 0) {
    return [];
  }
  const content = await readFile(join(logDir, files[0]), "utf8");
  return content.trim().split("\n").filter(Boolean);
}

describe("AppLogger", () => {
  beforeEach(async () => {
    logDir = await mkdtemp(join(tmpdir(), "tria-logs-"));
  });

  afterEach(async () => {
    await rm(logDir, { recursive: true, force: true });
  });

  it("keeps operational logs in normal mode and gates raw protocol logs to debug mode", async () => {
    const logger = new AppLogger();
    (logger as unknown as { logDir: string }).logDir = logDir;

    await logger.write("INFO", "started");
    await logger.write("TX", "raw command");

    expect(await readLogLines()).toHaveLength(1);

    logger.setLevel("debug");
    await logger.write("RX", "raw response");

    const lines = await readLogLines();
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("raw response");
  });
});
