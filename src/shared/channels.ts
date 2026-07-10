import type { ChannelId } from "./types.js";

export const CHANNELS: ChannelId[] = ["A", "B", "C", "D"];

export const AMP_CHANNELS: Record<ChannelId, string> = {
  A: "Vtr1",
  B: "Vtr2",
  C: "Vtr3",
  D: "Vtr4"
};

export function isChannelId(value: unknown): value is ChannelId {
  return value === "A" || value === "B" || value === "C" || value === "D";
}
