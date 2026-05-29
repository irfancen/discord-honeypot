import { Events, MessageFlags, type InteractionReplyOptions } from "discord.js";
import type { Event } from "../types/event.js";

const event: Event<typeof Events.InteractionCreate> = {
  name: Events.InteractionCreate,
  async execute(client, interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      console.warn(`Unknown command: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Error executing /${interaction.commandName}:`, error);

      const errorReply: InteractionReplyOptions = {
        content: "Something went wrong while running this command.",
        flags: MessageFlags.Ephemeral,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorReply);
      } else {
        await interaction.reply(errorReply);
      }
    }
  },
};

export default event;
