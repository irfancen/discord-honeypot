import type {
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  ChatInputCommandInteraction,
} from "discord.js";

export interface Command {
  // Subcommand-only commands (e.g. /honeypot) build to a different, narrower
  // builder type than plain commands, so both shapes are accepted.
  data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}
