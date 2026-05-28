import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Replies with pong and shows bot latency");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sent = await interaction.reply({
    content: "Pinging...",
    flags: MessageFlags.Ephemeral,
    withResponse: true,
  });

  const roundtrip = sent.interaction.createdTimestamp - interaction.createdTimestamp;
  const websocket = Math.round(interaction.client.ws.ping);

  await interaction.editReply(
    `🏓 Pong!\n**Roundtrip:** ${roundtrip}ms\n**WebSocket:** ${websocket}ms`
  );
}
