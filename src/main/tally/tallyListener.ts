import { EventEmitter } from "node:events";
import net from "node:net";
import type { AppSettings } from "../../shared/types.js";
import { CARBONITE_PGM_SOURCE_RAW_ADDRESS, parseTsl31Records, sourceIdFromTslText } from "./tsl31.js";

export interface TallyListenerStatus {
  listening: boolean;
  clientCount: number;
  port: number | null;
  text: string;
}

interface TallyListenerEvents {
  source: [sourceId: number, text: string, state: "on-air" | "off-air", kind: "update" | "sync-message"];
  status: [status: TallyListenerStatus];
  error: [message: string];
}

export declare interface TallyListener {
  on<K extends keyof TallyListenerEvents>(event: K, listener: (...args: TallyListenerEvents[K]) => void): this;
  emit<K extends keyof TallyListenerEvents>(event: K, ...args: TallyListenerEvents[K]): boolean;
}

export class TallyListener extends EventEmitter {
  private server: net.Server | null = null;
  private sockets = new Set<net.Socket>();
  private buffers = new Map<net.Socket, Buffer>();
  private port: number | null = null;

  start(settings: AppSettings): void {
    const nextPort = settings.tallyPort;
    if (this.server && this.port === nextPort) {
      return;
    }

    this.stop();
    this.port = nextPort;

    this.server = net.createServer((socket) => this.handleSocket(socket));
    this.server.on("error", (error) => {
      this.emit("error", `TSL listener error: ${error.message}`);
      this.emitStatus(`TSL listener error: ${error.message}`);
    });
    this.server.listen(nextPort, "0.0.0.0", () => {
      this.emitStatus(`TSL listening on TCP ${nextPort}`);
    });
  }

  stop(): void {
    for (const socket of this.sockets) {
      socket.destroy();
    }
    this.sockets.clear();
    this.buffers.clear();

    this.server?.close();
    this.server = null;
    this.port = null;
    this.emitStatus("TSL stopped");
  }

  private handleSocket(socket: net.Socket): void {
    this.sockets.add(socket);
    this.buffers.set(socket, Buffer.alloc(0));
    this.emitStatus(`TSL connected: ${socket.remoteAddress}:${socket.remotePort}`);

    socket.on("data", (data) => this.handleData(socket, data));
    socket.on("close", () => {
      this.sockets.delete(socket);
      this.buffers.delete(socket);
      this.emitStatus("TSL disconnected");
    });
    socket.on("error", (error) => {
      this.emit("error", `TSL socket error: ${error.message}`);
      this.emitStatus(`TSL socket error: ${error.message}`);
    });
  }

  private handleData(socket: net.Socket, data: Buffer): void {
    const previous = this.buffers.get(socket) ?? Buffer.alloc(0);
    const parsed = parseTsl31Records(Buffer.concat([previous, data]));
    this.buffers.set(socket, parsed.rest);
    const kind = parsed.records.length > 1 ? "sync-message" : "update";

    for (const record of parsed.records) {
      const sourceId = record.rawAddress === CARBONITE_PGM_SOURCE_RAW_ADDRESS ? sourceIdFromTslText(record.text) : record.address;
      if (sourceId !== null) {
        this.emit("source", sourceId, record.text, record.rawAddress === CARBONITE_PGM_SOURCE_RAW_ADDRESS ? "on-air" : "off-air", kind);
      }
    }
  }

  private emitStatus(text: string): void {
    this.emit("status", {
      listening: this.server !== null,
      clientCount: this.sockets.size,
      port: this.port,
      text
    });
  }
}
