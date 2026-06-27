import { TICK_RATE } from "@cs/shared";

/**
 * Client-side config. The client must run its prediction loop at the SAME tick
 * rate the server simulates at — so it reads the value from the shared package
 * rather than declaring its own. The contract test pins this.
 */
export const clientConfig = {
  tickRate: TICK_RATE,
} as const;
