import { readdirSync } from "fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BotClient } from "../types/client.js";
import type { Command } from "../types/command.js";
import { createLogger } from "../lib/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const log = createLogger("commandHandler");

export async function loadCommands(client: BotClient): Promise<void> {
  const commandsPath = join(__dirname, "..", "commands");
  const files = readdirSync(commandsPath).filter(
    (file) => file.endsWith(".ts") || file.endsWith(".js")
  );

  for (const file of files) {
    const filePath = join(commandsPath, file);
    const commandModule = await import(filePath);
    const command: Command = commandModule.default ?? commandModule;

    if (!command.data || !command.execute) {
      log.warn({ file }, 'Skipping: missing "data" or "execute" export.');
      continue;
    }

    client.commands.set(command.data.name, command);
    log.info({ command: command.data.name }, "Loaded command.");
  }

  log.info({ count: client.commands.size }, "Commands loaded.");
}
