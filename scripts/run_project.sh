#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_SCRIPT="$ROOT_DIR/scripts/start_microservices.sh"
PATTERN_SCRIPT="$ROOT_DIR/scripts/run_pattern_instances.sh"
PATTERN_VENV_DIR="${PATTERN_VENV_DIR:-$ROOT_DIR/.runtime/pattern_instances/.venv}"
SYSTEM_PYTHON_BIN="${SYSTEM_PYTHON_BIN:-python3}"
PYTHON_BIN="${PYTHON_BIN:-$PATTERN_VENV_DIR/bin/python}"

require_file() {
  if [[ ! -f "$1" ]]; then
    echo "Missing required file: $1" >&2
    exit 1
  fi
}

check_local_python() {
  if [[ -x "$PYTHON_BIN" ]]; then
    return
  fi

  if ! command -v "$SYSTEM_PYTHON_BIN" >/dev/null 2>&1; then
    echo "Missing Python interpreter: $SYSTEM_PYTHON_BIN" >&2
    exit 1
  fi

  mkdir -p "$(dirname "$PATTERN_VENV_DIR")"
  "$SYSTEM_PYTHON_BIN" -m venv "$PATTERN_VENV_DIR"
  "$PYTHON_BIN" -m pip install --upgrade pip >/dev/null
  "$PYTHON_BIN" -m pip install -r "$ROOT_DIR/back_locomotive/requirements.txt" >/dev/null
}

ensure_pattern_python() {
  check_local_python

  if ! "$PYTHON_BIN" - <<'PY' >/dev/null 2>&1
import fastapi  # noqa: F401
import uvicorn  # noqa: F401
PY
  then
    rm -rf "$PATTERN_VENV_DIR"
    check_local_python
  fi
}

show_status() {
  "$STACK_SCRIPT" ps
  echo
  "$PATTERN_SCRIPT" status
}

usage() {
  cat <<EOF
Usage: $0 [up|down|restart|status|stack-logs|pattern-logs] [args]

Commands:
  up                         Start Docker services, then start 10 pattern instances
  down                       Stop pattern instances, then stop Docker services
  restart                    Restart Docker services, then restart pattern instances
  status                     Show Docker and pattern instance status
  stack-logs [compose args]  Tail Docker compose logs
  pattern-logs LOCOMOTIVE_ID Tail one local pattern instance log
EOF
}

main() {
  require_file "$STACK_SCRIPT"
  require_file "$PATTERN_SCRIPT"

  local action="${1:-status}"
  shift || true

  case "$action" in
    up)
      ensure_pattern_python
      "$STACK_SCRIPT" up "$@"
      PYTHON_BIN="$PYTHON_BIN" "$PATTERN_SCRIPT" start
      echo
      show_status
      ;;
    down)
      "$PATTERN_SCRIPT" stop
      "$STACK_SCRIPT" down "$@"
      ;;
    restart)
      ensure_pattern_python
      "$PATTERN_SCRIPT" stop
      "$STACK_SCRIPT" restart "$@"
      PYTHON_BIN="$PYTHON_BIN" "$PATTERN_SCRIPT" start
      echo
      show_status
      ;;
    status)
      show_status
      ;;
    stack-logs)
      "$STACK_SCRIPT" logs "$@"
      ;;
    pattern-logs)
      if [[ $# -lt 1 ]]; then
        echo "pattern-logs requires a LOCOMOTIVE_ID" >&2
        exit 1
      fi
      "$PATTERN_SCRIPT" logs "$1"
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
