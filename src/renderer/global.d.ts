import type { AppApi } from "../shared/types.js";

declare global {
  interface Window {
    tria: AppApi;
  }
}

export {};
