# Contract: `just` recipe surface

This feature's "interface" is the set of `just` recipes a developer can invoke from the repo
root. This document is the contract other tooling/docs (and this feature's own tasks/tests)
should treat as the source of truth for recipe names, arguments, and observable behavior.

## `just` (no arguments)

Lists available recipes and points to `just dev up all` as the one-command bootstrap.

## `just install <target>`

| `<target>`  | Behavior |
|-------------|----------|
| `all`       | Runs `npm install` in `admin-api/`, `admin-ui/`, `public-ui/`, in that order. |
| `admin-api` | Runs `npm install` in `admin-api/` only. |
| `admin-ui`  | Runs `npm install` in `admin-ui/` only. |
| `public-ui` | Runs `npm install` in `public-ui/` only. |

Any other value: prints a usage error to stderr and exits non-zero. `npm install` is always
invoked (no `node_modules/` pre-check) — safe to re-run.

## `just env setup`

For each of the three projects, copies `<project>/.dev.vars.example` → `<project>/.dev.vars`
(admin-api) or `<project>/.env.example` → `<project>/.env` (admin-ui, public-ui) **only if the
destination file does not already exist**. An existing destination file is left completely
untouched (no diffing, no merging). Missing `.example` source files produce a warning, not a
failure.

`env` with any argument other than `setup` prints a usage error to stderr and exits non-zero.

## `just db migrate local`

Runs `admin-api`'s `npm run db:migrate:local` (`wrangler d1 migrations apply library-admin-db
--local`). Applying already-applied migrations is a no-op (owned by `wrangler`'s own migration
bookkeeping) — safe to re-run.

## `just db seed books [count=N]`

Runs `admin-api`'s `npm run db:seed:local`, optionally passing `--count=N` through when
`count=N` is supplied as an extra word:

| Invocation                    | Behavior |
|--------------------------------|----------|
| `just db seed books`           | Seeds the full curated list (36 books). |
| `just db seed books count=10`  | Seeds only the first 10 curated books. |

Re-running with the same or a larger count never duplicates existing rows (idempotent by title,
per the underlying script — see `admin-api/scripts/seed-books.mjs`).

Any `just db <subcommand> <target>` combination other than `migrate local` / `seed books`
prints a usage error to stderr and exits non-zero.

## `just dev up <target>`

| `<target>`  | Behavior |
|-------------|----------|
| `admin-api` | Runs `admin-api`'s `npm run dev` (`wrangler dev`) in the foreground. Prints `http://localhost:8787` first. |
| `admin-ui`  | Runs `admin-ui`'s `npm run dev` (`vite`, default port) in the foreground. Prints `http://localhost:5173` first. |
| `public-ui` | Runs `public-ui`'s `npm run dev` (`vite`, default port) in the foreground. Prints `http://localhost:5173` first. |
| `all`       | The one-command bootstrap — see below. |

Any other `<target>`: usage error to stderr, exit non-zero. `dev` with any subcommand other than
`up` also errors.

### `just dev up all` — the one-command bootstrap

In order:
1. `install all`
2. `env setup`
3. `db migrate local`
4. `db seed books` (full default list)
5. Prints all three expected URLs:
   - `admin-api  -> http://localhost:8787`
   - `admin-ui   -> http://localhost:5173`
   - `public-ui  -> http://localhost:5174`
6. Starts all three dev servers **concurrently**, `admin-ui` pinned to port 5173 and `public-ui`
   pinned to port 5174 (`--strictPort`, so a genuine conflict fails loudly rather than silently
   drifting to a different port than what was printed) — see `research.md` for why only this
   path pins ports.
7. Blocks until all three exit, or until interrupted (`Ctrl+C` / SIGINT / SIGTERM), at which
   point all three server processes (and their child processes) are terminated together and the
   recipe prints a confirmation before returning. No `wrangler`/`vite`/related process remains
   running after the recipe exits.

## Out of scope / non-goals

- No port-conflict detection or resolution beyond `--strictPort` failing loudly for the two UI
  projects in `dev up all`.
- No change to any project's own `package.json` scripts, build output, or runtime behavior.
- No CI integration — these recipes are local developer tooling only.
