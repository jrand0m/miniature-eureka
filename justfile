# justfile — local dev bootstrap for miniature-eureka
#
# Naming convention (see specs/007-justfile-dev-bootstrap/research.md):
#   just <top-domain> <subdomain/target> <clarifying-config>
# Recipes are ordered from GENERIC to SPECIFIC, e.g.:
#   good: `just db seed books`, `just dev up all`, `just install admin-api`
#   bad:  `just seed_books`, `just dev_up_all`, `just install-admin-api`
# Because `just` recipe names can't contain spaces, each top-level domain (`install`, `env`,
# `db`, `dev`) is a single recipe that takes the remaining words as positional parameters and
# dispatches on them internally (see research.md's "Multi-word recipe invocation" decision) —
# this keeps every recipe in this one root justfile rather than splitting into `just` modules.
#
# ---------------------------------------------------------------------------------------------
# `just dev up all` is the ONE-COMMAND BOOTSTRAP: it installs dependencies for all three
# projects, creates any missing .env/.dev.vars files (never overwriting ones that already
# exist), migrates the local D1 database, seeds it with the full curated book list, then starts
# admin-api (wrangler dev, http://localhost:8787), admin-ui (vite, http://localhost:5173), and
# public-ui (vite, http://localhost:5174) concurrently in this terminal. Ctrl+C stops all three
# together, with no orphaned processes left behind. Run `just` with no arguments for a recipe
# list, or see specs/007-justfile-dev-bootstrap/contracts/justfile-recipes.md for full details.
# ---------------------------------------------------------------------------------------------

# Default recipe: list what's available and point at the one-command bootstrap.
default:
    @just --list
    @echo ""
    @echo "Tip: run 'just dev up all' for the one-command local bootstrap (installs deps,"
    @echo "creates missing env files, migrates + seeds the DB, then starts all three dev"
    @echo "servers together)."

# just install all | just install <admin-api|admin-ui|public-ui>
install target:
    #!/usr/bin/env bash
    set -euo pipefail

    install_one() {
      echo "==> npm install ($1)"
      (cd "$1" && npm install)
    }

    case "{{target}}" in
      all)
        install_one admin-api
        install_one admin-ui
        install_one public-ui
        ;;
      admin-api|admin-ui|public-ui)
        install_one "{{target}}"
        ;;
      *)
        echo "error: unknown install target '{{target}}' (expected: all, admin-api, admin-ui, public-ui)" >&2
        exit 1
        ;;
    esac

# just env setup — copy each project's .env.example/.dev.vars.example to the real file, but
# only if the real file doesn't already exist (never overwrites a developer's customized file).
env action:
    #!/usr/bin/env bash
    set -euo pipefail

    copy_if_missing() {
      src="$1"; dest="$2"
      if [ -f "$dest" ]; then
        echo "==> $dest already exists, leaving it untouched"
      elif [ -f "$src" ]; then
        cp "$src" "$dest"
        echo "==> created $dest from $src"
      else
        echo "==> warning: $src not found, skipping" >&2
      fi
    }

    case "{{action}}" in
      setup)
        copy_if_missing admin-api/.dev.vars.example admin-api/.dev.vars
        copy_if_missing admin-ui/.env.example admin-ui/.env
        copy_if_missing public-ui/.env.example public-ui/.env
        ;;
      *)
        echo "error: unknown env action '{{action}}' (expected: setup)" >&2
        exit 1
        ;;
    esac

# just db migrate local
# just db seed books [count=N]
db subcommand target *args:
    #!/usr/bin/env bash
    set -euo pipefail

    case "{{subcommand}} {{target}}" in
      "migrate local")
        (cd admin-api && npm run db:migrate:local)
        ;;
      "seed books")
        count=""
        for arg in {{args}}; do
          case "$arg" in
            count=*) count="${arg#count=}" ;;
            *)
              echo "error: unknown argument '$arg' for 'just db seed books' (expected: count=N)" >&2
              exit 1
              ;;
          esac
        done
        if [ -n "$count" ]; then
          (cd admin-api && npm run db:seed:local -- --count="$count")
        else
          (cd admin-api && npm run db:seed:local)
        fi
        ;;
      *)
        echo "error: unknown command 'just db {{subcommand}} {{target}}' (expected: migrate local, seed books)" >&2
        exit 1
        ;;
    esac

# just dev up admin-api | just dev up admin-ui | just dev up public-ui | just dev up all
dev subcommand target:
    #!/usr/bin/env bash
    set -euo pipefail

    if [ "{{subcommand}}" != "up" ]; then
      echo "error: unknown dev subcommand '{{subcommand}}' (expected: up)" >&2
      exit 1
    fi

    case "{{target}}" in
      admin-api)
        echo "admin-api -> http://localhost:8787"
        cd admin-api && exec npm run dev
        ;;
      admin-ui)
        echo "admin-ui -> http://localhost:5173"
        cd admin-ui && exec npm run dev
        ;;
      public-ui)
        echo "public-ui -> http://localhost:5173"
        cd public-ui && exec npm run dev
        ;;
      all)
        just install all
        just env setup
        just db migrate local
        just db seed books

        echo ""
        echo "Starting dev servers:"
        echo "  admin-api  -> http://localhost:8787"
        echo "  admin-ui   -> http://localhost:5173"
        echo "  public-ui  -> http://localhost:5174"
        echo ""

        set -m

        pids=()
        cleanup_done=0
        cleanup() {
          if [ "$cleanup_done" -eq 1 ]; then
            return
          fi
          cleanup_done=1
          echo ""
          echo "Stopping dev servers..."
          for pid in "${pids[@]}"; do
            kill -TERM "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
          done
          wait 2>/dev/null || true
          echo "All dev servers stopped."
        }
        trap cleanup INT TERM EXIT

        (cd admin-api && exec npm run dev) &
        pids+=("$!")
        (cd admin-ui && exec npm run dev -- --port 5173 --strictPort) &
        pids+=("$!")
        (cd public-ui && exec npm run dev -- --port 5174 --strictPort) &
        pids+=("$!")

        wait
        ;;
      *)
        echo "error: unknown dev target '{{target}}' (expected: admin-api, admin-ui, public-ui, all)" >&2
        exit 1
        ;;
    esac
