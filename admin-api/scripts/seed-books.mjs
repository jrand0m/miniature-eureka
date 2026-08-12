#!/usr/bin/env node
// T003/T005/T007: Dev-only local seed script for the `books` table.
//
// IMPORTANT: This is local developer tooling only. It is NEVER mounted as an HTTP route in
// admin-api/src/index.ts and must not be reachable over the network — it only ever runs as a
// one-off local command (`npm run db:seed:local`) shelling out to `wrangler d1 execute ...
// --local`, the same way `npm run db:migrate:local` already does.
//
// Idempotency: rows are keyed by exact `title` match. Before generating INSERTs, this script
// fetches the set of titles already present in the local `books` table and skips any curated
// entry whose title is already there. No new migration or UNIQUE constraint was added for this
// (the `books` table's migration is owned by a separate, concurrently-developed feature) — see
// specs/003-book-backfill-seed/research.md ("Idempotency" decision) for the full rationale.
// This means running `npm run db:seed:local` any number of times, with any sequence of
// `--count` values, never produces more than one row per curated title — safe to call on every
// `just dev up` in a later dev-bootstrap feature.
//
// Usage:
//   node scripts/seed-books.mjs                 # seed the full curated list (30+ books)
//   node scripts/seed-books.mjs --count=5        # seed only the first 5 curated books
// (equivalently: npm run db:seed:local -- --count=5)
//
// `--count=N` contract (see specs/003-book-backfill-seed/contracts/cli.md):
//   - Omitted: seed the entire curated list.
//   - N > curated list size: clamped down to the curated list size (never fabricates entries).
//   - N <= 0 or non-numeric: user error — printed to stderr, exits non-zero, no DB writes.

import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import CATALOG from "./seed-books-catalog.mjs";

const DB_NAME = "library-admin-db";

function parseCount(argv) {
  const arg = argv.find((a) => a.startsWith("--count="));
  if (!arg) {
    return CATALOG.length;
  }
  const raw = arg.slice("--count=".length);
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    console.error(
      `Invalid --count value "${raw}": must be a positive integer. ` +
        `Omit --count to seed the full curated list (${CATALOG.length} books).`,
    );
    process.exit(1);
  }
  return Math.min(n, CATALOG.length);
}

function sqlEscape(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Runs a wrangler d1 command and returns { status, stdout, stderr }. */
function runWrangler(args) {
  const result = spawnSync("npx", ["wrangler", "d1", ...args], {
    cwd: path.join(import.meta.dirname, ".."),
    encoding: "utf8",
  });
  return result;
}

function fetchExistingTitles() {
  const result = runWrangler([
    "execute",
    DB_NAME,
    "--local",
    "--json",
    "--command",
    "SELECT title FROM books",
  ]);
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    console.error(
      `Failed to query the local "${DB_NAME}" database. Has the books table been migrated? ` +
        `Run "npm run db:migrate:local" first.`,
    );
    process.exit(result.status ?? 1);
  }
  const titles = new Set();
  try {
    const parsed = JSON.parse(result.stdout);
    // `wrangler d1 execute --json` returns an array of { results: [...] } per statement.
    for (const batch of parsed) {
      for (const row of batch.results ?? []) {
        if (typeof row.title === "string") {
          titles.add(row.title);
        }
      }
    }
  } catch {
    // Empty table / no output still parses as valid JSON from wrangler in practice; if parsing
    // truly fails, treat it as "no existing titles" rather than aborting the whole seed run.
  }
  return titles;
}

function buildInsertStatements(entries, createdAt) {
  return entries.map((book) => {
    const id = randomUUID();
    return (
      `INSERT INTO books (id, title, author, isbn, description, quantity_total, quantity_available, created_at) ` +
      `VALUES (${sqlEscape(id)}, ${sqlEscape(book.title)}, ${sqlEscape(book.author)}, ` +
      `${sqlEscape(book.isbn)}, ${sqlEscape(book.description)}, ${book.quantityTotal}, ` +
      `${book.quantityTotal}, ${sqlEscape(createdAt)});`
    );
  });
}

function main() {
  const count = parseCount(process.argv.slice(2));
  const workingSet = CATALOG.slice(0, count);

  const existingTitles = fetchExistingTitles();
  const toInsert = workingSet.filter((book) => !existingTitles.has(book.title));
  const skipped = workingSet.length - toInsert.length;

  if (toInsert.length === 0) {
    console.log(`db:seed:local: 0 inserted, ${skipped} already present. Nothing to do.`);
    return;
  }

  const createdAt = new Date().toISOString();
  const statements = buildInsertStatements(toInsert, createdAt);

  const tmpDir = mkdtempSync(path.join(tmpdir(), "seed-books-"));
  const sqlFile = path.join(tmpDir, "seed-books.sql");
  writeFileSync(sqlFile, statements.join("\n") + "\n", "utf8");

  try {
    const result = runWrangler(["execute", DB_NAME, "--local", `--file=${sqlFile}`]);
    if (result.status !== 0) {
      console.error(result.stderr || result.stdout);
      console.error(`Failed to apply generated seed SQL to the local "${DB_NAME}" database.`);
      process.exit(result.status ?? 1);
    }
    console.log(`db:seed:local: ${toInsert.length} inserted, ${skipped} already present.`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

main();
