import type { ClientEvents } from "discord.js";
import type { BotClient } from "./client.js";

export interface Event<K extends keyof ClientEvents = keyof ClientEvents> {
  name: K;
  once?: boolean;
  execute: (client: BotClient, ...args: ClientEvents[K]) => Promise<void> | void;
}
