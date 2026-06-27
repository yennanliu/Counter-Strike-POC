import { TICK_RATE } from "@cs/shared";

/**
 * Server-side config. The authoritative simulation loop runs at this rate; it is
 * the single source of truth that the client mirrors (see clientConfig). Reading
 * from the shared package guarantees client and server can never drift apart.
 */
export const serverConfig = {
  tickRate: TICK_RATE,
} as const;
