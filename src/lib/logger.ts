import pino from "pino";

/**
 * Root structured logger. Level via the `LOG_LEVEL` env var (default "info").
 * Outputs JSON — ideal for ingestion on the VPS. For pretty local output,
 * `npm i -D pino-pretty` and pipe: `npm run dev | npx pino-pretty`.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
});

/** A child logger tagged with a module name (replaces "[module]" prefixes). */
export function createLogger(module: string) {
  return logger.child({ module });
}
