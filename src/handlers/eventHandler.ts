import { readdirSync } from "fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BotClient } from "../types/client.js";
import type { Event } from "../types/event.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
      console.warn(`Skipping ${file}: missing "name" or "execute" export`);
      continue;
    }

    const listener = (...args: unknown[]) =>
      (event.execute as (...args: unknown[]) => void)(client, ...args);

    if (event.once) {
      client.once(event.name, listener);
    } else {
      client.on(event.name, listener);
    }

    console.log(`Loaded event: ${event.name}${event.once ? " (once)" : ""}`);
  }

  console.log(`Loaded ${files.length} event(s) total`);
}
