import { Pool } from "pg";
import { Kysely, PostgresDialect } from "kysely";
import { config } from "../config.js";
import type { Database } from "../types/database.js";

const pool = new Pool({
  connectionString: config.databaseUrl,
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});

export async function closeDatabase(): Promise<void> {
  await db.destroy();
}
