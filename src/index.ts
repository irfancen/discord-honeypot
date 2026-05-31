import { Client, Collection, GatewayIntentBits, Partials } from "discord.js";
import { config } from "./config.js";
import { loadCommands } from "./handlers/commandHandler.js";
import { loadEvents } from "./handlers/eventHandler.js";
import type { BotClient } from "./types/client.js";
import type { Command } from "./types/command.js";
import { logger } from "./lib/logger.js";
import { closeDatabase } from "./database/client.js";

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
  logger.fatal({ err: error }, "Failed to start bot.");
  process.exit(1);
});

/** Disconnect from Discord and close the DB pool on shutdown. */
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info({ signal }, "Shutting down…");
  try {
    await client.destroy();
    await closeDatabase();
  } catch (error) {
    logger.error({ err: error }, "Error during shutdown.");
  } finally {
    process.exit(0);
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void shutdown(signal));
}
