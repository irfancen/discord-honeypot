import { Kysely, sql } from "kysely";

/**
 * Initial schema for the honeypot bot.
 *
 * Note: the parameter is typed `Kysely<any>` by convention for migrations —
 * migrations run against the schema as it exists at that point in time, which
 * may differ from the current app-level Database type. Using `any` keeps
 * migrations decoupled from the evolving schema interface.
 */

export async function up(db: Kysely<any>): Promise<void> {
  // ── guild_settings ─────────────────────────────────────────────
  // One row per server. NULL on a default = "use the hardcoded baseline".
  await db.schema
    .createTable("guild_settings")
    .addColumn("guild_id", "text", (col) => col.primaryKey())
    .addColumn("log_channel_id", "text")
    .addColumn("default_action", "text", (col) =>
      col.check(sql`default_action IN ('ban', 'timeout', 'kick')`)
    )
    .addColumn("default_delete_message_seconds", "integer")
    .addColumn("default_exempt_admins", "boolean")
    .execute();

  // ── honeypot_channels ──────────────────────────────────────────
  // One row per honeypot channel. NULL on a setting = inherit from guild.
  await db.schema
    .createTable("honeypot_channels")
    .addColumn("guild_id", "text", (col) => col.notNull())
    .addColumn("channel_id", "text", (col) => col.notNull())
    .addColumn("added_by", "text", (col) => col.notNull())
    .addColumn("added_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn("action", "text", (col) =>
      col.check(sql`action IN ('ban', 'timeout', 'kick')`)
    )
    .addColumn("delete_message_seconds", "integer")
    .addColumn("exempt_admins", "boolean")
    .addColumn("bypass_roles_overridden", "boolean", (col) =>
      col.notNull().defaultTo(false)
    )
    .addPrimaryKeyConstraint("honeypot_channels_pk", ["guild_id", "channel_id"])
    .execute();

  // ── guild_bypass_roles ─────────────────────────────────────────
  // Roles that grant honeypot bypass at the server-default level.
  await db.schema
    .createTable("guild_bypass_roles")
    .addColumn("guild_id", "text", (col) => col.notNull())
    .addColumn("role_id", "text", (col) => col.notNull())
    .addPrimaryKeyConstraint("guild_bypass_roles_pk", ["guild_id", "role_id"])
    .execute();

  // ── channel_bypass_roles ───────────────────────────────────────
  // Roles that grant bypass for a specific honeypot channel (override level).
  await db.schema
    .createTable("channel_bypass_roles")
    .addColumn("guild_id", "text", (col) => col.notNull())
    .addColumn("channel_id", "text", (col) => col.notNull())
    .addColumn("role_id", "text", (col) => col.notNull())
    .addPrimaryKeyConstraint("channel_bypass_roles_pk", [
      "guild_id",
      "channel_id",
      "role_id",
    ])
    .addForeignKeyConstraint(
      "channel_bypass_roles_fk",
      ["guild_id", "channel_id"],
      "honeypot_channels",
      ["guild_id", "channel_id"],
      (cb) => cb.onDelete("cascade")
    )
    .execute();

  // ── honeypot_hits ──────────────────────────────────────────────
  // Audit log of every honeypot trigger.
  await db.schema
    .createTable("honeypot_hits")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("guild_id", "text", (col) => col.notNull())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("channel_id", "text", (col) => col.notNull())
    .addColumn("message_content", "text")
    .addColumn("action_taken", "text", (col) =>
      col.notNull().check(sql`action_taken IN ('ban', 'timeout', 'kick')`)
    )
    .addColumn("hit_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  // ── indexes ────────────────────────────────────────────────────
  await db.schema
    .createIndex("idx_honeypot_channels_guild")
    .on("honeypot_channels")
    .column("guild_id")
    .execute();

  await db.schema
    .createIndex("idx_honeypot_hits_guild_user")
    .on("honeypot_hits")
    .columns(["guild_id", "user_id"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop in reverse order of creation to respect foreign keys.
  await db.schema.dropTable("honeypot_hits").execute();
  await db.schema.dropTable("channel_bypass_roles").execute();
  await db.schema.dropTable("guild_bypass_roles").execute();
  await db.schema.dropTable("honeypot_channels").execute();
  await db.schema.dropTable("guild_settings").execute();
}
