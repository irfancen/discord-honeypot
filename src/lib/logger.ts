import pino from "pino";


export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
});

export function createLogger(module: string) {
  return logger.child({ module });
}
