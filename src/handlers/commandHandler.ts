import { readdirSync } from "fs";
import { join } from "path";
import type { BotClient } from "../types/client.js";
import type { Command } from "../types/command.js";

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
      console.warn(`Skipping ${file}: missing "data" or "execute" export`);
      continue;
    }

    client.commands.set(command.data.name, command);
    console.log(`Loaded command: ${command.data.name}`);
  }

  console.log(`Loaded ${client.commands.size} command(s) total`);
}
