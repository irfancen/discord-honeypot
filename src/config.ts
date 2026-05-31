import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const config = {
  token: required("DISCORD_TOKEN"),
  clientId: required("CLIENT_ID"),
  // When set, slash commands register to this one guild (instant — for dev).
  // When unset, they register globally (all guilds; ~1h to propagate).
  guildId: optional("GUILD_ID"),
  databaseUrl: required("DATABASE_URL"),
} as const;
