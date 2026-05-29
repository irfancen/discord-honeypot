import { migrateToLatest } from "../database/migrations/runner.js";
import { closeDatabase } from "../database/client.js";

async function main() {
  console.log("Running migrations...");
  await migrateToLatest();
  console.log("Migrations complete.");
  await closeDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
