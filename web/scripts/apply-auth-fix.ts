/**
 * Apply 004_fix_auth_trigger.sql to Supabase Postgres.
 *
 * Requires DATABASE_URL in web/.env.local, e.g. from Supabase:
 * Settings → Database → Connection string → URI (Session pooler)
 *
 * Usage (from web/):
 *   npm run fix:auth
 */

import { loadEnvConfig } from "@next/env";
import { readFileSync } from "fs";
import { resolve } from "path";

loadEnvConfig(resolve(__dirname, ".."));

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Set DATABASE_URL in web/.env.local (Supabase → Settings → Database → URI)");
    process.exit(1);
  }

  const { default: pg } = await import("pg");
  const sql = readFileSync(resolve(__dirname, "../../supabase/migrations/004_fix_auth_trigger.sql"), "utf-8");
  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log("Applied auth trigger fix.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
