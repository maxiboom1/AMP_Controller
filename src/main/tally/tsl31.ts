export interface Tsl31Record {
  rawAddress: number;
  address: number;
  control: number;
  text: string;
}

export const TSL31_RECORD_BYTES = 18;
export const CARBONITE_PGM_SOURCE_RAW_ADDRESS = 0x99;

export function parseTsl31Records(buffer: Buffer): { records: Tsl31Record[]; rest: Buffer } {
  const records: Tsl31Record[] = [];
  let cursor = 0;

  while (cursor + TSL31_RECORD_BYTES <= buffer.length) {
    const rawAddress = buffer[cursor];
    const control = buffer[cursor + 1];
    const text = buffer
      .subarray(cursor + 2, cursor + TSL31_RECORD_BYTES)
      .toString("ascii")
      .trimEnd();

    records.push({
      rawAddress,
      address: rawAddress & 0x7f,
      control,
      text
    });
    cursor += TSL31_RECORD_BYTES;
  }

  return {
    records,
    rest: buffer.subarray(cursor)
  };
}

export function sourceIdFromTslText(text: string): number | null {
  const match = /^(\d{1,3}):/.exec(text.trim());
  if (!match) {
    return null;
  }

  const sourceId = Number.parseInt(match[1], 10);
  return Number.isFinite(sourceId) ? sourceId : null;
}
