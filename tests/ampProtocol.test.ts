import { describe, expect, it } from "vitest";
import {
  AMP,
  buildAmpStringCommand,
  decodeAmpNameList,
  framesToTimecode,
  isEmptyFolderMarker,
  normalizeClipPath,
  parseAmpMessages,
  parseStatusSense,
  parseTimecodeHex,
  timecodeToFrames
} from "../src/main/amp/ampProtocol.js";

describe("AMP protocol helpers", () => {
  it("builds string commands matching the Dashboard AMP example", () => {
    expect(buildAmpStringCommand("default", AMP.SET_BIN)).toBe("CMDS0026a20e0009000764656661756c74\n");
  });

  it("builds Tria clip paths", () => {
    expect(normalizeClipPath("IMPORTS", "OPENING")).toBe("V:/IMPORTS/OPENING");
    expect(normalizeClipPath("", "OPENING")).toBe("V:/OPENING");
    expect(normalizeClipPath("IMPORTS", "V:/IMPORTS/OPENING")).toBe("V:/IMPORTS/OPENING");
    expect(normalizeClipPath("IMPORTS", "\\IMPORTS\\OPENING")).toBe("V:/IMPORTS/OPENING");
    expect(normalizeClipPath("08-06-2026\\IMPORTS", "OPENING")).toBe("V:/08-06-2026/IMPORTS/OPENING");
  });

  it("parses simple and payload messages from a stream", () => {
    const parsed = parseAmpMessages(`1001822a00090007494d504f525453tail`);
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[0]).toMatchObject({ code: AMP.ACK, kind: "ack" });
    expect(parsed.messages[1]).toMatchObject({ code: AMP.LIST_FIRST_FOLDER_RETURN, kind: "payload", payloadHex: "0007494d504f525453" });
    expect(parsed.rest).toBe("tail");
  });

  it("keeps partial stream buffers intact until a full payload arrives", () => {
    const partial = parseAmpMessages("822A000C000A30382D30362D");
    expect(partial.messages).toEqual([]);
    expect(partial.rest).toBe("822A000C000A30382D30362D");

    const complete = parseAmpMessages(`${partial.rest}32303236`);
    expect(complete.messages).toHaveLength(1);
    expect(decodeAmpNameList(complete.messages[0].payloadHex ?? "")).toEqual(["08-06-2026"]);
  });

  it("surfaces malformed variable-length payload metadata as parser errors", () => {
    const parsed = parseAmpMessages("822AZZZZ1001");
    expect(parsed.messages[0]).toMatchObject({ code: AMP.LIST_FIRST_FOLDER_RETURN, kind: "error" });
    expect(parsed.messages.at(-1)).toMatchObject({ code: AMP.ACK, kind: "ack" });
  });

  it("parses uppercase variable-length folder replies from Tria", () => {
    const parsed = parseAmpMessages("822A000C000A30382D30362D32303236");

    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0]).toMatchObject({
      code: AMP.LIST_FIRST_FOLDER_RETURN,
      kind: "payload",
      length: 12,
      payloadHex: "000A30382D30362D32303236",
      raw: "822A000C000A30382D30362D32303236"
    });
    expect(decodeAmpNameList(parsed.messages[0].payloadHex ?? "")).toEqual(["08-06-2026"]);
  });

  it("parses Tria folder list completion and empty-folder ID markers", () => {
    const parsed = parseAmpMessages("802A8A140010000E2A454D50545920464F4C4445522A8014");

    expect(parsed.messages[0]).toMatchObject({ code: AMP.FOLDER_LIST_COMPLETE, kind: "complete" });
    expect(parsed.messages[1]).toMatchObject({ code: AMP.ID_RETURN, payloadHex: "000E2A454D50545920464F4C4445522A" });
    expect(parsed.messages[2]).toMatchObject({ code: AMP.NO_MORE_ID, kind: "complete" });
    expect(decodeAmpNameList(parsed.messages[1].payloadHex ?? "")).toEqual(["*EMPTY FOLDER*"]);
    expect(isEmptyFolderMarker("*empty folder*")).toBe(true);
  });

  it("parses fixed-length transport status responses", () => {
    const parsed = parseAmpMessages("7F20802101814000000000000000000000tail");

    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0]).toMatchObject({
      code: "7f20",
      kind: "payload",
      payloadHex: "802101814000000000000000000000"
    });
    expect(parsed.rest).toBe("tail");
    expect(parseStatusSense(parsed.messages[0].payloadHex ?? "")).toMatchObject({
      busy: true,
      play: true,
      stop: true,
      cueComplete: true,
      autoMode: true,
      inPreset: true,
      loop: false
    });
  });

  it("treats the final Tria/Sony status byte as the loop indicator", () => {
    expect(parseStatusSense("008180012000000000000000000001")).toMatchObject({
      play: true,
      loop: true
    });
    expect(parseStatusSense("008181810000000000000000000001")).toMatchObject({
      loop: true
    });
    expect(parseStatusSense("00A002812100000000000000008000")).toMatchObject({
      loop: false
    });
  });

  it("parses AMP timecode and converts remaining frames", () => {
    const parsed = parseAmpMessages("740412030501841718020000");

    expect(parsed.messages[0]).toMatchObject({ code: "7404", payloadHex: "12030501" });
    expect(parsed.messages[1]).toMatchObject({ code: AMP.ID_DURATION_RETURN, payloadHex: "18020000" });
    expect(parseTimecodeHex(parsed.messages[0].payloadHex ?? "")).toBe("01:05:03:12");
    expect(parseTimecodeHex(parsed.messages[1].payloadHex ?? "")).toBe("00:00:02:18");
    expect(timecodeToFrames("00:00:03:00", 25)).toBe(75);
    expect(framesToTimecode(75, 25)).toBe("00:00:03:00");
  });

  it("decodes AMP name lists", () => {
    expect(decodeAmpNameList("0007494d504f5254530004434c4950")).toEqual(["IMPORTS", "CLIP"]);
  });
});
