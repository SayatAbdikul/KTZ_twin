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

load_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Missing env file: $ENV_FILE" >&2
    exit 1
  fi

  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
}

print_urls() {
  cat <<EOF
Stack is up.

Locomotive backend:  http://localhost:${LOCOMOTIVE_PORT}/ping
Dispatcher backend:  http://localhost:${DISPATCHER_PORT}/ping
Locomotive frontend: http://localhost:${FRONT_LOCOMOTIVE_PORT}
Dispatcher frontend: http://localhost:${FRONT_DISPATCHER_PORT}
EOF
}

main() {
  require_cmd docker
  load_env

  local action="${1:-up}"
  shift || true

  case "$action" in
    up)
      compose up --build -d "$@"
      print_urls
      ;;
    down)
      compose down --remove-orphans "$@"
      ;;
    restart)
      compose down --remove-orphans
      compose up --build -d "$@"
      print_urls
      ;;
    logs)
      compose logs -f "$@"
      ;;
    ps)
      compose ps
      ;;
    *)
      echo "Usage: $0 [up|down|restart|logs|ps] [compose args...]" >&2
      exit 1
      ;;
  esac
}

main "$@"
