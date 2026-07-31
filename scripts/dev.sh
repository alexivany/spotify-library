#!/usr/bin/env bash
set -euo pipefail

# Local Supabase binds fixed host ports (API on 54321, etc.). Only one project's
# stack can hold those ports at a time, so if another project's stack is up, this
# app silently talks to the WRONG database and every query fails with
# "Could not find the table 'public.<x>' in the schema cache".
#
# setup-local-db.sh stops any other project's stack, brings this project's up
# with health-check recovery, writes the local Supabase creds into .env.local,
# and regenerates lib/supabase/types.ts. Then we start Next.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "→ Setting up local Supabase for spotify-library…"
bash "$SCRIPT_DIR/setup-local-db.sh"

echo "→ Starting Next dev server…"
exec next dev -H 127.0.0.1
