//**
// scripts/db-migrate.mjs
// Migration runner over raw pg (replaces supabase db push, whose connector fails on this project)
//**
#!/usr/bin/env node
// Migration runner over a raw pg connection — replaces `supabase db push`,
// whose connector fails against this project (verified: raw pg auth succeeds
// where the CLI reports 28P01). Applies any supabase/migrations/*.sql not yet
// recorded in supabase_migrations.schema_migrations.
import { readFileSync, readdirSync } from "node:fs";
import { Client } from "pg";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim() ?? "";
const ref = get("NEXT_PUBLIC_SUPABASE_URL").replace(/^https:\/\//, "").split(".")[0];

const client = new Client({
  host: "aws-0-us-east-1.pooler.supabase.com",
  port: 5432,
  user: `postgres.${ref}`,
  database: "postgres",
  password: get("SUPABASE_DB_PASSWORD"),
  ssl: { rejectUnauthorized: false },
});

await client.connect();
await client.query(`create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);`);
const { rows } = await client.query("select version from supabase_migrations.schema_migrations");
const applied = new Set(rows.map((r) => r.version));

const dir = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) {
  const version = f.split("_")[0];
  if (applied.has(version)) continue;
  process.stdout.write(`applying ${f}... `);
  try {
    await client.query("begin");
    await client.query(readFileSync(new URL(f, dir), "utf8"));
    await client.query(
      "insert into supabase_migrations.schema_migrations (version, name) values ($1,$2)",
      [version, f.replace(/^\d+_/, "").replace(/\.sql$/, "")]
    );
    await client.query("commit");
    console.log("ok");
  } catch (e) {
    await client.query("rollback");
    console.log("FAILED:", e.message);
    process.exitCode = 1;
    break;
  }
}
await client.end();
