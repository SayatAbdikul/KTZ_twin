#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.microservices.yml"
ENV_FILE="$ROOT_DIR/.env.microservices"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

run_dispatcher_migrations() {
  echo "Applying dispatcher migrations..."
  compose up -d timescaledb
  compose build back_dispatcher
  compose run --rm --no-deps back_dispatcher sh -lc \
    'python -c "from app.db import wait_for_db; import sys; raise SystemExit(0 if wait_for_db(max_attempts=60, sleep_s=1.0) else 1)" && alembic -c app/alembic.ini upgrade head'
}

load_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Missing env file: $ENV_FILE" >&2
    exit 1
  fi

  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" ]] && continue
    [[ "$line" =~ ^[[:space:]]*# ]] && continue

    local key="${line%%=*}"
    local value="${line#*=}"
    export "$key=$value"
  done < "$ENV_FILE"
}

print_urls() {
  cat <<EOF
Stack is up.

Locomotive backend:  http://localhost:${LOCOMOTIVE_PORT}/ping
Dispatcher backend:  http://localhost:${DISPATCHER_PORT}/ping
Frontend:            http://localhost:${FRONT_LOCOMOTIVE_PORT}
EOF
}

main() {
  require_cmd docker
  load_env

  local action="${1:-up}"
  shift || true

  case "$action" in
    up)
      run_dispatcher_migrations
      compose up --build -d "$@"
      print_urls
      ;;
    down)
      compose down --remove-orphans "$@"
      ;;
    restart)
      compose down --remove-orphans
      run_dispatcher_migrations
      compose up --build -d "$@"
      print_urls
      ;;
    migrate)
      run_dispatcher_migrations
      ;;
    logs)
      compose logs -f "$@"
      ;;
    ps)
      compose ps
      ;;
    *)
      echo "Usage: $0 [up|down|restart|migrate|logs|ps] [compose args...]" >&2
      exit 1
      ;;
  esac
}

main "$@"
