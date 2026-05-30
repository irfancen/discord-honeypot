import { Kysely } from "kysely";

/**
 * Adds a configurable timeout duration (seconds) at both the guild-default and
 * channel-override levels, parallel to delete_message_seconds. NULL = inherit
 * the next level in the chain (channel → guild → hardcoded baseline).
 */

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("guild_settings")
    .addColumn("default_timeout_seconds", "integer")
    .execute();

  await db.schema
    .alterTable("honeypot_channels")
    .addColumn("timeout_seconds", "integer")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("honeypot_channels")
    .dropColumn("timeout_seconds")
    .execute();

  await db.schema
    .alterTable("guild_settings")
    .dropColumn("default_timeout_seconds")
    .execute();
}
