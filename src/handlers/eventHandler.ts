import { readdirSync } from "fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BotClient } from "../types/client.js";
import type { Event } from "../types/event.js";
import { createLogger } from "../lib/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const log = createLogger("eventHandler");

export async function loadEvents(client: BotClient): Promise<void> {
  const eventsPath = join(__dirname, "..", "events");
  const files = readdirSync(eventsPath).filter(
    (file) => file.endsWith(".ts") || file.endsWith(".js")
  );

  for (const file of files) {
    const filePath = join(eventsPath, file);
    const eventModule = await import(filePath);
    const event: Event = eventModule.default ?? eventModule;

    if (!event.name || !event.execute) {
      log.warn({ file }, 'Skipping: missing "name" or "execute" export.');
      continue;
    }

    const listener = (...args: unknown[]) =>
      (event.execute as (...args: unknown[]) => void)(client, ...args);

    if (event.once) {
      client.once(event.name, listener);
    } else {
      client.on(event.name, listener);
    }

    log.info({ event: event.name, once: event.once ?? false }, "Loaded event.");
  }

  log.info({ count: files.length }, "Events loaded.");
}
