import { Events } from "discord.js";
import type { Event } from "../types/event.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("ready");

const event: Event<typeof Events.ClientReady> = {
  name: Events.ClientReady,
  once: true,
  async execute(_client, readyClient) {
    log.info(
      { user: readyClient.user.tag, guilds: readyClient.guilds.cache.size },
      "Logged in."
    );
  },
};

export default event;
