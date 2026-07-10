import { app, shell } from "electron";
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { LoggingLevel } from "../shared/types.js";

export class AppLogger {
  private logDir = "";
  private level: LoggingLevel = "normal";

  async init(): Promise<void> {
    this.logDir = join(app.getPath("userData"), "logs");
    await mkdir(this.logDir, { recursive: true });
  }

  get directory(): string {
    return this.logDir;
  }

  setLevel(level: LoggingLevel): void {
    this.level = level;
  }

  async write(level: "INFO" | "WARN" | "ERROR" | "TX" | "RX", message: string, data?: unknown): Promise<void> {
    if (!this.logDir) {
      return;
    }
    if ((level === "TX" || level === "RX") && this.level !== "debug") {
      return;
    }

    const date = new Date();
    const day = date.toISOString().slice(0, 10);
    const line = JSON.stringify({
      at: date.toISOString(),
      level,
      message,
      data
    });

    await appendFile(join(this.logDir, `${day}.log`), `${line}\n`, "utf8");
  }

  async openFolder(): Promise<string> {
    await shell.openPath(this.logDir);
    return this.logDir;
  }
}
