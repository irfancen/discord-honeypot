import { Client, Collection, GatewayIntentBits, Partials } from "discord.js";
import { config } from "./config.js";
import { loadCommands } from "./handlers/commandHandler.js";
import { loadEvents } from "./handlers/eventHandler.js";
import type { BotClient } from "./types/client.js";
import type { Command } from "./types/command.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Message, Partials.Channel],
}) as BotClient;

client.commands = new Collection<string, Command>();

async function main() {
  await loadCommands(client);
  await loadEvents(client);
  await client.login(config.token);
}

main().catch((error) => {
  console.error("Failed to start bot:", error);
  process.exit(1);
});
