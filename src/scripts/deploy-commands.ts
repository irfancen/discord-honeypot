import { REST, Routes } from "discord.js";
import { readdirSync } from "fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import type { Command } from "../types/command.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function deploy() {
  const commands: unknown[] = [];
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

    commands.push(command.data.toJSON());
    console.log(`Prepared command: ${command.data.name}`);
  }

  const rest = new REST().setToken(config.token);

  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);
  const scope = config.guildId
    ? `guild ${config.guildId} (instant)`
    : "globally (all guilds; ~1h to propagate)";

  console.log(`\nRegistering ${commands.length} command(s) ${scope}...`);

  const data = (await rest.put(route, { body: commands })) as unknown[];

  console.log(`Successfully registered ${data.length} command(s).`);
}

deploy().catch((error) => {
  console.error("Failed to deploy commands:", error);
  process.exit(1);
});
