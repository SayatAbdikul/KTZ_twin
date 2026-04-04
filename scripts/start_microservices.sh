#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.microservices.yml"
CSV_PATH="$ROOT_DIR/synthetic_output_core/telemetry.csv"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

ensure_csv() {
  if [[ -f "$CSV_PATH" ]]; then
    return
  fi

  echo "Telemetry seed file not found at $CSV_PATH"
  echo "Generating synthetic telemetry seed..."
  require_cmd python3
  (cd "$ROOT_DIR" && python3 generate_core_synthetic_telemetry.py)
}

print_urls() {
  cat <<'EOF'
Stack is up.

Locomotive backend:  http://localhost:3001/ping
Dispatcher backend:  http://localhost:3010/ping
Locomotive frontend: http://localhost:5173
Dispatcher frontend: http://localhost:5174
Kafka broker:        localhost:29092
EOF
}

main() {
  require_cmd docker

  local action="${1:-up}"
  shift || true

  case "$action" in
    up)
      ensure_csv
      compose up --build -d "$@"
      print_urls
      ;;
    down)
      compose down --remove-orphans "$@"
      ;;
    restart)
      ensure_csv
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
