import {
  Events,
  MessageFlags,
  type ButtonInteraction,
  type InteractionReplyOptions,
} from "discord.js";
import type { Event } from "../types/event.js";
import { guildSettingsService } from "../services/guildSettingsService.js";
import { pendingDefaults, parseCustomId } from "../services/pendingDefaults.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("interaction");

const event: Event<typeof Events.InteractionCreate> = {
  name: Events.InteractionCreate,
  async execute(client, interaction) {
    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      log.warn({ command: interaction.commandName }, "Unknown command.");
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      log.error({ err: error, command: interaction.commandName }, "Error executing command.");

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

/** Handle the `/config defaults` confirmation buttons. */
async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) return; // not one of ours

  const pending = pendingDefaults.take(parsed.id);
  if (!pending) {
    await interaction.update({
      content: "This confirmation has expired. Please run the command again.",
      components: [],
    });
    return;
  }

  // The confirmation is ephemeral (only the initiator sees it), but gate on the
  // initiator anyway as defense in depth.
  if (interaction.user.id !== pending.userId) {
    await interaction.reply({
      content: "Only the admin who started this change can confirm it.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    switch (parsed.action) {
      case "adopt":
        await guildSettingsService.applyDefaults(pending.guildId, pending.change);
        await interaction.update({
          content: "✅ New defaults applied. Inheriting channels now use the new values.",
          components: [],
        });
        break;
      case "keep":
        await guildSettingsService.keepCurrentValuesThenApply(
          pending.guildId,
          pending.change
        );
        await interaction.update({
          content: "✅ New defaults saved. Existing channels kept their current values.",
          components: [],
        });
        break;
      case "cancel":
        await interaction.update({
          content: "Cancelled — no changes made.",
          components: [],
        });
        break;
    }
  } catch (error) {
    log.error({ err: error }, "Error applying config defaults confirmation.");
    await interaction.update({
      content: "Something went wrong applying the change. Please try again.",
      components: [],
    });
  }
}

export default event;
