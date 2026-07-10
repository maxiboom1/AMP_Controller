import { EventEmitter } from "node:events";
import net from "node:net";
import type { AppSettings, ChannelId, ConnectionState } from "../../shared/types.js";
import type { AppLogger } from "../logger.js";
import { ampGreeting, parseAmpMessages } from "./ampProtocol.js";
import type { AmpParsedMessage } from "../../shared/types.js";

const CHANNELS: Array<{ channel: ChannelId; ampChannel: string; vtrNumber: number }> = [
  { channel: "A", ampChannel: "Vtr1", vtrNumber: 1 },
  { channel: "B", ampChannel: "Vtr2", vtrNumber: 2 },
  { channel: "C", ampChannel: "Vtr3", vtrNumber: 3 },
  { channel: "D", ampChannel: "Vtr4", vtrNumber: 4 }
];

interface ChannelRuntime {
  channel: ChannelId;
  ampChannel: string;
  vtrNumber: number;
  state: ConnectionState;
  socket: net.Socket | null;
  buffer: string;
  lastMessage: string;
  queue: Array<{ command: string; label: string; dedupeKey?: string }>;
  busy: boolean;
  responseTimer: NodeJS.Timeout | null;
}

export interface AmpClientEvents {
  status: [summary: ReturnType<AmpClient["getSummary"]>];
  message: [channel: ChannelId, message: AmpParsedMessage];
}

export declare interface AmpClient {
  on<U extends keyof AmpClientEvents>(event: U, listener: (...args: AmpClientEvents[U]) => void): this;
  emit<U extends keyof AmpClientEvents>(event: U, ...args: AmpClientEvents[U]): boolean;
}

export class AmpClient extends EventEmitter {
  private channels = new Map<ChannelId, ChannelRuntime>();
  private settings: AppSettings | null = null;

  constructor(private logger: AppLogger) {
    super();
    for (const channel of CHANNELS) {
      this.channels.set(channel.channel, {
        ...channel,
        state: "disconnected",
        socket: null,
        buffer: "",
        lastMessage: "",
        queue: [],
        busy: false,
        responseTimer: null
      });
    }
  }

  connect(settings: AppSettings): void {
    this.settings = settings;
    for (const runtime of this.channels.values()) {
      this.connectChannel(runtime);
    }
  }

  disconnect(): void {
    for (const runtime of this.channels.values()) {
      runtime.socket?.removeAllListeners();
      runtime.socket?.destroy();
      runtime.socket = null;
      runtime.state = "disconnected";
      runtime.lastMessage = "Disconnected";
      runtime.buffer = "";
      runtime.queue = [];
      runtime.busy = false;
      this.clearResponseTimer(runtime);
    }
    this.emit("status", this.getSummary());
  }

  send(channel: ChannelId, command: string, label = command.trim(), options: { dedupeKey?: string } = {}): boolean {
    const runtime = this.channels.get(channel);
    if (!runtime?.socket || runtime.state !== "connected") {
      void this.logger.write("WARN", `TX skipped, channel ${channel} not connected`, { label });
      return false;
    }

    if (options.dedupeKey) {
      runtime.queue = runtime.queue.filter((queued) => queued.dedupeKey !== options.dedupeKey);
    }

    runtime.queue.push({ command, label, dedupeKey: options.dedupeKey });
    this.drainQueue(runtime);
    return true;
  }

  queueSize(channel: ChannelId): number {
    const runtime = this.channels.get(channel);
    return runtime ? runtime.queue.length + (runtime.busy ? 1 : 0) : 0;
  }

  getSummary(): Record<ChannelId, { channel: ChannelId; ampChannel: string; state: ConnectionState; lastMessage: string }> {
    const summary = {} as Record<ChannelId, { channel: ChannelId; ampChannel: string; state: ConnectionState; lastMessage: string }>;
    for (const runtime of this.channels.values()) {
      summary[runtime.channel] = {
        channel: runtime.channel,
        ampChannel: runtime.ampChannel,
        state: runtime.state,
        lastMessage: runtime.lastMessage
      };
    }
    return summary;
  }

  isConnected(channel: ChannelId): boolean {
    return this.channels.get(channel)?.state === "connected";
  }

  private connectChannel(runtime: ChannelRuntime): void {
    if (!this.settings) {
      return;
    }

    runtime.socket?.removeAllListeners();
    runtime.socket?.destroy();
    runtime.state = "connecting";
    runtime.lastMessage = `Connecting to ${this.settings.triaIp}:${this.settings.port}`;
    runtime.buffer = "";
    runtime.queue = [];
    runtime.busy = false;
    this.clearResponseTimer(runtime);
    this.emit("status", this.getSummary());

    const socket = net.createConnection({
      host: this.settings.triaIp,
      port: this.settings.port
    });

    runtime.socket = socket;
    socket.setKeepAlive(true, 5000);

    socket.on("connect", () => {
      runtime.state = "connected";
      runtime.lastMessage = "Connected";
      const greeting = ampGreeting(runtime.vtrNumber);
      socket.write(greeting, "ascii");
      void this.logger.write("TX", `${runtime.channel} greeting`, { command: greeting.replace(/\n/g, "\\n") });
      this.emit("status", this.getSummary());
    });

    socket.on("data", (data) => {
      if (runtime.socket !== socket) {
        return;
      }
      const text = data.toString("ascii");
      runtime.buffer += text;
      void this.logger.write("RX", `${runtime.channel} raw`, { text });

      const parsed = parseAmpMessages(runtime.buffer);
      runtime.buffer = parsed.rest;

      for (const message of parsed.messages) {
        this.completeCommand(runtime);
        runtime.lastMessage = `RX ${message.code}`;
        this.emit("message", runtime.channel, message);
      }

      this.emit("status", this.getSummary());
    });

    socket.on("error", (error) => {
      if (runtime.socket !== socket) {
        return;
      }
      runtime.state = "error";
      runtime.lastMessage = error.message;
      runtime.queue = [];
      runtime.busy = false;
      this.clearResponseTimer(runtime);
      void this.logger.write("ERROR", `${runtime.channel} socket error`, { message: error.message });
      this.emit("status", this.getSummary());
    });

    socket.on("close", () => {
      if (runtime.socket !== socket) {
        return;
      }
      if (runtime.state !== "error") {
        runtime.state = "disconnected";
      }
      runtime.socket = null;
      runtime.queue = [];
      runtime.busy = false;
      this.clearResponseTimer(runtime);
      if (runtime.lastMessage === "Connected") {
        runtime.lastMessage = "Connection closed";
      }
      this.emit("status", this.getSummary());
    });
  }

  private drainQueue(runtime: ChannelRuntime): void {
    if (runtime.busy || !runtime.socket || runtime.state !== "connected") {
      return;
    }

    const next = runtime.queue.shift();
    if (!next) {
      return;
    }

    runtime.busy = true;
    runtime.socket.write(next.command, "ascii");
    runtime.lastMessage = `TX ${next.label}`;
    void this.logger.write("TX", `${runtime.channel} ${next.label}`, { command: next.command.replace(/\n/g, "\\n") });
    this.emit("status", this.getSummary());
    runtime.responseTimer = setTimeout(() => {
      runtime.busy = false;
      runtime.lastMessage = `Timeout waiting for ${next.label}`;
      void this.logger.write("WARN", `${runtime.channel} command timeout`, { label: next.label });
      this.drainQueue(runtime);
      this.emit("status", this.getSummary());
    }, 1000);
  }

  private completeCommand(runtime: ChannelRuntime): void {
    this.clearResponseTimer(runtime);
    runtime.busy = false;
    this.drainQueue(runtime);
  }

  private clearResponseTimer(runtime: ChannelRuntime): void {
    if (runtime.responseTimer) {
      clearTimeout(runtime.responseTimer);
      runtime.responseTimer = null;
    }
  }
}
