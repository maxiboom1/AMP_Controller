import type { AmpParsedMessage } from "../../shared/types.js";
export { framesToTimecode, timecodeToFrames } from "../../shared/timecode.js";

export const AMP = {
  LIST_FIRST_FOLDER: "CMDS0004A02A\n",
  LIST_NEXT_FOLDER: "CMDS0004A02B\n",
  LIST_FIRST_ID: "CMDS0008A2140000\n",
  LIST_NEXT_ID: "CMDS0006a115FF\n",
  IDS_CHANGED_LIST_REQUEST: "CMDS0004A012\n",
  ID_LOADED_REQUEST: "CMDS0004A016\n",
  CURRENT_TIME_TIMER: "CMDS0006610C04\n",
  STATUS_SENSE_ALL: "CMDS000661200F\n",
  PLAY: "CMDS00042001\n",
  STOP: "CMDS00042000\n",
  EJECT: "CMDS0004200F\n",
  LOOP_ON: "CMDS0006414201\n",
  LOOP_OFF: "CMDS0006414200\n",
  AUTO_MODE_ON: "CMDS00044041\n",
  SET_BIN: "a20e",
  LOAD_CLIP: "4a14",
  ID_DURATION_REQUEST: "a217",
  ACK: "1001",
  NAK: "1111",
  ERROR: "1112",
  LIST_FIRST_FOLDER_RETURN: "822a",
  LIST_NEXT_FOLDER_RETURN: "822b",
  FOLDER_LIST_COMPLETE: "802a",
  BIN_LIST_COMPLETE: "802b",
  ID_RETURN: "8a14",
  NO_MORE_ID: "8014",
  ID_INFO_RETURN: "8a13",
  IDS_CHANGED_LIST_RETURN: "8213",
  ID_LOADED_RETURN: "8216",
  NO_ID_LOADED_RETURN: "8016",
  ID_DURATION_RETURN: "8417",
  ID_DURATION_NOT_FOUND_RETURN: "8017"
} as const;

const SIMPLE_CODES = new Set<string>([
  AMP.ACK,
  AMP.NAK,
  AMP.ERROR,
  AMP.FOLDER_LIST_COMPLETE,
  AMP.BIN_LIST_COMPLETE,
  AMP.NO_MORE_ID,
  AMP.NO_ID_LOADED_RETURN,
  AMP.ID_DURATION_NOT_FOUND_RETURN
]);

const VARIABLE_LENGTH_CODES = new Set<string>([
  AMP.LIST_FIRST_FOLDER_RETURN,
  AMP.LIST_NEXT_FOLDER_RETURN,
  AMP.ID_RETURN,
  AMP.IDS_CHANGED_LIST_RETURN,
  AMP.ID_LOADED_RETURN
]);

export function ampGreeting(vtrNumber: number): string {
  return `CRAT0007204Vtr${vtrNumber}\n`;
}

export function buildAmpStringCommand(value: string, commandType: string): string {
  const bytes = Buffer.from(value, "utf8");
  const clipNameLen = bytes.length.toString(16).padStart(4, "0");
  const actualCountByte = (bytes.length + 2).toString(16).padStart(4, "0");
  const totalCmdCounter = (bytes.length * 2 + 12).toString(10).padStart(4, "0");
  return `CMDS${totalCmdCounter}${commandType}${actualCountByte}${clipNameLen}${bytes.toString("hex")}\n`;
}

export function buildAmpFixedCommand(commandHex: string, dataHex = ""): string {
  const payload = `${commandHex}${dataHex}`;
  return `CMDS${payload.length.toString(10).padStart(4, "0")}${payload}\n`;
}

export function normalizeClipPath(folder: string, clipNameOrPath: string): string {
  const normalizedClip = clipNameOrPath.replace(/\\/g, "/");
  if (/^V:\//i.test(normalizedClip)) {
    return `V:/${normalizedClip.replace(/^V:\//i, "").replace(/^\/+/, "")}`;
  }

  if (normalizedClip.startsWith("/")) {
    return `V:/${normalizedClip.replace(/^\/+/, "")}`;
  }

  const cleanedFolder = folder
    .replace(/\\/g, "/")
    .replace(/^V:\//i, "")
    .replace(/^\/+|\/+$/g, "");
  const cleanedClip = normalizedClip.replace(/^\/+/, "");

  if (!cleanedFolder) {
    return `V:/${cleanedClip}`;
  }

  return `V:/${cleanedFolder}/${cleanedClip}`;
}

export function isEmptyFolderMarker(name: string): boolean {
  return name.trim().toUpperCase() === "*EMPTY FOLDER*";
}

export function parseAmpMessages(buffer: string): { messages: AmpParsedMessage[]; rest: string } {
  const messages: AmpParsedMessage[] = [];
  let rest = buffer;

  while (rest.length >= 4) {
    const wireCode = rest.slice(0, 4);
    const code = wireCode.toLowerCase();

    if (SIMPLE_CODES.has(code)) {
      messages.push({
        code,
        kind: code === AMP.ACK ? "ack" : code === AMP.NAK ? "nak" : code === AMP.ERROR ? "error" : "complete",
        raw: wireCode
      });
      rest = rest.slice(4);
      continue;
    }

    if (VARIABLE_LENGTH_CODES.has(code)) {
      if (rest.length < 8) {
        break;
      }

      const lengthText = rest.slice(4, 8);
      if (!/^[0-9a-fA-F]{4}$/.test(lengthText)) {
        messages.push({
          code,
          kind: "error",
          raw: rest.slice(0, Math.min(rest.length, 16))
        });
        rest = rest.slice(4);
        continue;
      }

      const payloadLength = Number.parseInt(lengthText, 16) * 2;
      const fullLength = 8 + payloadLength;
      if (rest.length < fullLength) {
        break;
      }

      const raw = rest.slice(0, fullLength);
      messages.push({
        code,
        kind: "payload",
        length: Number.parseInt(lengthText, 16),
        payloadHex: rest.slice(8, fullLength),
        raw
      });
      rest = rest.slice(fullLength);
      continue;
    }

    const fixedByteCount = Number.parseInt(wireCode[1], 16);
    if (!Number.isFinite(fixedByteCount)) {
      messages.push({
        code,
        kind: "error",
        raw: rest.slice(0, Math.min(rest.length, 16))
      });
      rest = rest.slice(4);
      continue;
    }

    const payloadLength = fixedByteCount * 2;
    const fullLength = 4 + payloadLength;
    if (rest.length < fullLength) {
      break;
    }

    const raw = rest.slice(0, fullLength);
    messages.push({
      code,
      kind: "payload",
      length: fixedByteCount,
      payloadHex: rest.slice(4, fullLength),
      raw
    });
    rest = rest.slice(fullLength);
  }

  return { messages, rest };
}

export interface AmpTransportStatus {
  busy: boolean;
  stop: boolean;
  play: boolean;
  record: boolean;
  still: boolean;
  cueComplete: boolean;
  inPreset: boolean;
  autoMode: boolean;
  loop: boolean;
}

export function parseStatusSense(payloadHex: string): AmpTransportStatus | null {
  const bytes = payloadHex.match(/.{1,2}/g)?.map((value) => Number.parseInt(value, 16));
  if (!bytes || bytes.length < 5) {
    return null;
  }

  return {
    busy: (bytes[0] & 0x80) !== 0,
    stop: (bytes[1] & 0x20) !== 0,
    play: (bytes[1] & 0x01) !== 0,
    record: (bytes[1] & 0x02) !== 0,
    still: (bytes[2] & 0x02) !== 0,
    cueComplete: (bytes[2] & 0x01) !== 0,
    inPreset: (bytes[3] & 0x01) !== 0,
    autoMode: (bytes[3] & 0x80) !== 0,
    loop: (bytes[bytes.length - 1] & 0x01) !== 0
  };
}

export function parseTimecodeHex(payloadHex: string): string | null {
  const bytes = payloadHex.match(/.{1,2}/g);
  if (!bytes || bytes.length < 4) {
    return null;
  }

  const [frames, seconds, minutes, hours] = bytes;
  return `${hours}:${minutes}:${seconds}:${frames}`.toUpperCase();
}

export function decodeAmpNameList(payloadHex: string): string[] {
  const names: string[] = [];
  let cursor = 0;

  while (cursor + 4 <= payloadHex.length) {
    const byteLength = Number.parseInt(payloadHex.slice(cursor, cursor + 4), 16);
    cursor += 4;

    if (!Number.isFinite(byteLength) || byteLength < 0) {
      break;
    }

    const hexLength = byteLength * 2;
    if (cursor + hexLength > payloadHex.length) {
      break;
    }

    const nameHex = payloadHex.slice(cursor, cursor + hexLength);
    names.push(Buffer.from(nameHex, "hex").toString("utf8"));
    cursor += hexLength;
  }

  return names;
}

export interface IdsChangedEvent {
  folder: string;
  clipName: string;
  type: "add" | "remove" | "unknown";
}

export function parseIdsChangedPayload(payloadHex: string): IdsChangedEvent[] {
  const events: IdsChangedEvent[] = [];
  let cursor = 0;

  function takeName(): string | null {
    if (cursor + 4 > payloadHex.length) {
      return null;
    }
    const length = Number.parseInt(payloadHex.slice(cursor, cursor + 4), 16);
    cursor += 4;
    const end = cursor + length * 2;
    if (!Number.isFinite(length) || end > payloadHex.length) {
      return null;
    }
    const value = Buffer.from(payloadHex.slice(cursor, end), "hex").toString("utf8");
    cursor = end;
    return value;
  }

  while (cursor + 10 <= payloadHex.length) {
    const volume = takeName();
    const folder = takeName();

    if (volume === null || folder === null || cursor + 2 > payloadHex.length) {
      break;
    }

    const count = Number.parseInt(payloadHex.slice(cursor, cursor + 2), 16);
    cursor += 2;

    for (let index = 0; index < count; index += 1) {
      if (cursor + 8 > payloadHex.length) {
        return events;
      }

      const eventCode = payloadHex.slice(cursor, cursor + 4);
      cursor += 4;
      const clipLength = Number.parseInt(payloadHex.slice(cursor, cursor + 4), 16);
      cursor += 4;
      const clipEnd = cursor + clipLength * 2;

      if (!Number.isFinite(clipLength) || clipEnd > payloadHex.length) {
        return events;
      }

      const clipName = Buffer.from(payloadHex.slice(cursor, clipEnd), "hex").toString("utf8");
      cursor = clipEnd;

      events.push({
        folder,
        clipName,
        type: eventCode === "0001" ? "add" : eventCode === "0002" ? "remove" : "unknown"
      });
    }
  }

  return events;
}
