import { Events } from "discord.js";
import type { Event } from "../types/event.js";
import { honeypotService } from "../services/honeypotService.js";

/**
 * Fires for every message. Delegates to honeypotService, which short-circuits
 * cheaply for non-honeypot channels. Errors are caught here so a handler failure
 * never becomes an unhandled rejection.
 */
const event: Event<typeof Events.MessageCreate> = {
  name: Events.MessageCreate,
  async execute(_client, message) {
    try {
      await honeypotService.handleMessage(message);
    } catch (error) {
      console.error("[messageCreate] Error handling message:", error);
    }
  },
};

export default event;
