import { Events } from "discord.js";
import type { Event } from "../types/event.js";

const event: Event<typeof Events.ClientReady> = {
  name: Events.ClientReady,
  once: true,
  async execute(_client, readyClient) {
    console.log(`Logged in as ${readyClient.user.tag}`);
    console.log(`Serving ${readyClient.guilds.cache.size} guild(s)`);
  },
};

export default event;
