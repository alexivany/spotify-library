#!/bin/bash

set -euo pipefail

# Paths below are relative to the project root, so anchor there regardless of
# where this script is invoked from.
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ENV_FILE=".env.local"
PROD_BACKUP=".env.local.production"
PROJECT_ID="spotify-library"
TYPES_FILE="lib/supabase/types.ts"
STUDIO_URL="http://127.0.0.1:54323"

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker Desktop first."
  exit 1
fi

stop_other_projects() {
  local other_containers
  other_containers=$(docker ps --filter "name=supabase_" --format "{{.ID}} {{.Names}}" | grep -v "$PROJECT_ID" || true)

  if [ -n "$other_containers" ]; then
    echo "Stopping other Supabase projects to free local resources..."
    echo "$other_containers" | while read -r _ name; do
      echo "  Stopping $name"
    done
    echo "$other_containers" | awk '{print $1}' | xargs -r docker stop >/dev/null 2>&1 || true
  fi
}

cleanup_corrupted_state() {
  # NOTE: `--no-backup` discards the Postgres data volume — any un-synced local
  # data here is lost. That's acceptable because this only runs on a stack that
  # failed to start, and the app writes a CSV snapshot after every sync
  # (backups/<timestamp>/) that `bun db:restore` can reload. If you keep local
  # data that never gets synced, back it up before relying on this path.
  echo "Cleaning up corrupted local Supabase state (this drops the local data volume)..."
  supabase stop --no-backup >/dev/null 2>&1 || true
  docker ps -a --filter "name=supabase_.*_${PROJECT_ID}" --format "{{.ID}}" | xargs -r docker rm -f >/dev/null 2>&1 || true
  docker network ls --filter "name=supabase_network_${PROJECT_ID}" --format "{{.ID}}" | xargs -r docker network rm >/dev/null 2>&1 || true
  sleep 2
}

verify_containers_healthy() {
  local db_container="supabase_db_${PROJECT_ID}"

  if ! docker ps --format "{{.Names}}" | grep -q "^${db_container}$"; then
    return 1
  fi

  if ! docker exec "$db_container" pg_isready -U postgres >/dev/null 2>&1; then
    return 1
  fi

  return 0
}

check_for_stopped_services() {
  local status_output
  status_output=$(supabase status 2>&1 || true)

  if echo "$status_output" | grep -q "Stopped services:"; then
    return 0
  fi

  return 1
}

start_supabase_with_recovery() {
  local max_attempts=3
  local attempt=1
  # Generous per-attempt window: a first run (or one after `docker system prune`)
  # pulls ~12 images, which can easily exceed a couple of minutes — especially if
  # Docker Hub rate-limits anonymous pulls and layers retry with backoff. Images
  # are cached after the first pull, so later runs finish in seconds regardless.
  local timeout_seconds=600

  while [ "$attempt" -le "$max_attempts" ]; do
    echo "Starting local Supabase (attempt $attempt/$max_attempts)..."

    supabase start --ignore-health-check &
    local pid=$!
    local elapsed=0

    while kill -0 "$pid" 2>/dev/null && [ "$elapsed" -lt "$timeout_seconds" ]; do
      sleep 5
      elapsed=$((elapsed + 5))
    done

    if ! kill -0 "$pid" 2>/dev/null; then
      local exit_code=0
      wait "$pid" || exit_code=$?

      if [ "$exit_code" -eq 0 ]; then
        sleep 3
        if verify_containers_healthy; then
          echo "Local Supabase started successfully."
          return 0
        fi
      fi
    else
      echo "Supabase start timed out after ${timeout_seconds}s."
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true

      if verify_containers_healthy; then
        echo "Database container is healthy despite startup timeout; continuing."
        return 0
      fi
    fi

    if verify_containers_healthy; then
      echo "Database container is healthy; continuing."
      return 0
    fi

    if [ "$attempt" -lt "$max_attempts" ]; then
      cleanup_corrupted_state
    fi

    attempt=$((attempt + 1))
  done

  echo "Failed to start local Supabase after $max_attempts attempts."
  if ! docker system info 2>/dev/null | grep -qi "^ *Username:"; then
    echo
    echo "If you saw 'error from registry: Rate exceeded' above, Docker Hub is"
    echo "throttling anonymous image pulls. Run 'docker login' (a free account"
    echo "works) and re-run this script — authenticated pulls have a higher limit."
  fi
  return 1
}

wait_for_storage() {
  local storage_url="http://127.0.0.1:54321/storage/v1/bucket"
  local max_attempts=12
  local attempt=1
  local wait_seconds=5

  echo "Waiting for local Supabase storage..."
  while [ "$attempt" -le "$max_attempts" ]; do
    if curl -s --connect-timeout 3 --max-time 5 -o /dev/null -w "%{http_code}" "$storage_url" 2>/dev/null | grep -qE "^[2-4]"; then
      echo "Storage service is ready."
      return 0
    fi

    echo "  Storage not ready yet (attempt $attempt/$max_attempts)..."
    sleep "$wait_seconds"
    attempt=$((attempt + 1))
  done

  echo "Storage did not become ready within $((max_attempts * wait_seconds))s; continuing with database-only local setup."
  return 0
}

set_env_var() {
  local key="$1"
  local value="$2"

  touch "$ENV_FILE"
  grep -v "^${key}=" "$ENV_FILE" > "${ENV_FILE}.tmp" || true
  mv "${ENV_FILE}.tmp" "$ENV_FILE"
  echo "${key}=\"${value}\"" >> "$ENV_FILE"
}

stop_other_projects

if supabase status >/dev/null 2>&1 && verify_containers_healthy; then
  if check_for_stopped_services; then
    echo "Local Supabase has stopped services; doing a clean restart..."
    cleanup_corrupted_state
    start_supabase_with_recovery
  else
    echo "Local Supabase is already running."
  fi
else
  if supabase status >/dev/null 2>&1; then
    echo "Local Supabase state exists but containers are unhealthy."
    cleanup_corrupted_state
  fi
  start_supabase_with_recovery
fi

wait_for_storage

if [ -f "$ENV_FILE" ] && [ ! -f "$PROD_BACKUP" ]; then
  if grep -q "supabase.co" "$ENV_FILE"; then
    echo "Backing up remote Supabase credentials to $PROD_BACKUP."
    cp "$ENV_FILE" "$PROD_BACKUP"
  fi
fi

echo "Getting local Supabase credentials..."
STATUS_JSON=$(supabase status --output json 2>/dev/null)
API_URL=$(echo "$STATUS_JSON" | grep '"API_URL"' | cut -d'"' -f4)
SERVICE_KEY=$(echo "$STATUS_JSON" | grep '"SERVICE_ROLE_KEY"' | cut -d'"' -f4)

if [ -z "$API_URL" ] || [ -z "$SERVICE_KEY" ]; then
  echo "Failed to read local Supabase credentials."
  exit 1
fi

echo "Updating $ENV_FILE with local Supabase credentials..."
set_env_var "SUPABASE_URL" "$API_URL"
set_env_var "SUPABASE_SERVICE_ROLE_KEY" "$SERVICE_KEY"

if ! grep -q "^CRON_SECRET=" "$ENV_FILE" 2>/dev/null; then
  set_env_var "CRON_SECRET" "$(openssl rand -hex 32)"
fi

if ! grep -q "^SPOTIFY_REDIRECT_URI=" "$ENV_FILE" 2>/dev/null; then
  set_env_var "SPOTIFY_REDIRECT_URI" "http://127.0.0.1:3000/api/spotify/callback"
fi

if ! grep -q "^MUSICBRAINZ_MIN_REQUEST_INTERVAL_MS=" "$ENV_FILE" 2>/dev/null; then
  set_env_var "MUSICBRAINZ_MIN_REQUEST_INTERVAL_MS" "1100"
fi

mkdir -p "$(dirname "$TYPES_FILE")"
if supabase gen types typescript --local > "$TYPES_FILE" 2>/dev/null; then
  echo "Generated Supabase types at $TYPES_FILE"
else
  echo "Skipped type generation. Run bun run update-types after Supabase is healthy."
fi

echo "Local Supabase ready: $API_URL"
echo "Local Supabase Studio: $STUDIO_URL"
