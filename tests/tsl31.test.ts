import { describe, expect, it } from "vitest";
import { CARBONITE_PGM_SOURCE_RAW_ADDRESS, parseTsl31Records, sourceIdFromTslText } from "../src/main/tally/tsl31.js";

describe("TSL 3.1 parser", () => {
  it("parses 18-byte UMD records and keeps incomplete tails", () => {
    const first = Buffer.from("86125654522D412020202020202020202020", "hex");
    const second = Buffer.from("99123030363A5654522D4120202020202020", "hex");
    const tail = Buffer.from("ABCD", "hex");

    const parsed = parseTsl31Records(Buffer.concat([first, second, tail]));

    expect(parsed.records).toEqual([
      {
        rawAddress: 0x86,
        address: 0x06,
        control: 0x12,
        text: "VTR-A"
      },
      {
        rawAddress: CARBONITE_PGM_SOURCE_RAW_ADDRESS,
        address: 0x19,
        control: 0x12,
        text: "006:VTR-A"
      }
    ]);
    expect(parsed.rest).toEqual(tail);
  });

  it("extracts numeric source IDs from Carbonite source text", () => {
    expect(sourceIdFromTslText("006:VTR-A")).toBe(6);
    expect(sourceIdFromTslText("009:VTR-D")).toBe(9);
    expect(sourceIdFromTslText("PGM")).toBeNull();
  });
});
