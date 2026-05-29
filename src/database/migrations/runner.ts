import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Migrator, FileMigrationProvider } from "kysely/migration";
import { db } from "../client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createMigrator(): Migrator {
  return new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, "files"),
    }),
  });
}

export async function migrateToLatest(): Promise<void> {
  const migrator = createMigrator();
  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((result) => {
    if (result.status === "Success") {
      console.log(`✓ Migration "${result.migrationName}" applied`);
    } else if (result.status === "Error") {
      console.error(`✗ Migration "${result.migrationName}" failed`);
    }
  });

  if (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}
