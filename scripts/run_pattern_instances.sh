#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACK_LOCOMOTIVE_DIR="$ROOT_DIR/back_locomotive"
RUNTIME_DIR="$ROOT_DIR/.runtime/pattern_instances"
PID_DIR="$RUNTIME_DIR/pids"
LOG_DIR="$RUNTIME_DIR/logs"

PYTHON_BIN="${PYTHON_BIN:-python3}"
LOCOMOTIVE_HOST="${LOCOMOTIVE_HOST:-127.0.0.1}"
BASE_PORT="${PATTERN_INSTANCE_BASE_PORT:-3101}"

LOCOMOTIVES=(
  "KTZ-BRK-001"
  "KTZ-PNE-002"
  "KTZ-OIL-003"
  "KTZ-THM-004"
  "KTZ-DRV-005"
  "KTZ-VLT-006"
  "KTZ-AMP-007"
  "KTZ-FUL-008"
  "KTZ-BRN-009"
  "KTZ-MIX-010"
)

mkdir -p "$PID_DIR" "$LOG_DIR"

pid_file() {
  local locomotive_id="$1"
  printf '%s/%s.pid\n' "$PID_DIR" "$locomotive_id"
}

log_file() {
  local locomotive_id="$1"
  printf '%s/%s.log\n' "$LOG_DIR" "$locomotive_id"
}

instance_port() {
  local index="$1"
  printf '%d\n' "$((BASE_PORT + index))"
}

is_running() {
  local pid="$1"
  kill -0 "$pid" >/dev/null 2>&1
}

start_one() {
  local locomotive_id="$1"
  local port="$2"
  local pid_path
  local log_path
  local pid
  local launcher

  pid_path="$(pid_file "$locomotive_id")"
  log_path="$(log_file "$locomotive_id")"

  if [[ -f "$pid_path" ]]; then
    pid="$(<"$pid_path")"
    if [[ -n "$pid" ]] && is_running "$pid"; then
      printf 'already running  %s  pid=%s  port=%s  log=%s\n' "$locomotive_id" "$pid" "$port" "$log_path"
      return
    fi
    rm -f "$pid_path"
  fi

  if command -v setsid >/dev/null 2>&1; then
    launcher="setsid"
  else
    launcher="nohup"
  fi

  "$launcher" env \
    PYTHONUNBUFFERED="1" \
    LOCOMOTIVE_ID="$locomotive_id" \
    LOCOMOTIVE_PORT="$port" \
    LOCOMOTIVE_HOST="$LOCOMOTIVE_HOST" \
    PORT="$port" \
    KAFKA_ENABLED="${KAFKA_ENABLED:-true}" \
    KAFKA_BOOTSTRAP_SERVERS="${KAFKA_BOOTSTRAP_SERVERS:-localhost:9092}" \
    KAFKA_TOPIC_EVENTS="${KAFKA_TOPIC_EVENTS:-ktz.locomotive.events}" \
    KAFKA_TOPIC_PARTITIONS="${KAFKA_TOPIC_PARTITIONS:-100}" \
    KAFKA_TOPIC_REPLICATION_FACTOR="${KAFKA_TOPIC_REPLICATION_FACTOR:-1}" \
    PATTERN_FLEET_ENABLED="false" \
    API_KEY="${API_KEY:-ktz-demo-key}" \
    CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:5173,http://localhost:4173}" \
    bash -lc "cd \"$BACK_LOCOMOTIVE_DIR\" && exec \"$PYTHON_BIN\" -m uvicorn app.main:app --host \"$LOCOMOTIVE_HOST\" --port \"$port\"" \
    >"$log_path" 2>&1 < /dev/null &

  pid="$!"
  printf '%s\n' "$pid" >"$pid_path"
  printf 'started          %s  pid=%s  port=%s  log=%s\n' "$locomotive_id" "$pid" "$port" "$log_path"
}

stop_one() {
  local locomotive_id="$1"
  local pid_path
  local pid

  pid_path="$(pid_file "$locomotive_id")"
  if [[ ! -f "$pid_path" ]]; then
    printf 'not running      %s\n' "$locomotive_id"
    return
  fi

  pid="$(<"$pid_path")"
  if [[ -n "$pid" ]] && is_running "$pid"; then
    kill "$pid"
    printf 'stopped          %s  pid=%s\n' "$locomotive_id" "$pid"
  else
    printf 'stale pid file   %s  pid=%s\n' "$locomotive_id" "$pid"
  fi

  rm -f "$pid_path"
}

status_all() {
  local index locomotive_id pid_path log_path pid port
  for index in "${!LOCOMOTIVES[@]}"; do
    locomotive_id="${LOCOMOTIVES[$index]}"
    pid_path="$(pid_file "$locomotive_id")"
    log_path="$(log_file "$locomotive_id")"
    port="$(instance_port "$index")"

    if [[ -f "$pid_path" ]]; then
      pid="$(<"$pid_path")"
      if [[ -n "$pid" ]] && is_running "$pid"; then
        printf 'running          %s  pid=%s  port=%s  log=%s\n' "$locomotive_id" "$pid" "$port" "$log_path"
        continue
      fi
    fi

    printf 'stopped          %s  port=%s  log=%s\n' "$locomotive_id" "$port" "$log_path"
  done
}

logs_one() {
  local locomotive_id="$1"
  local log_path

  log_path="$(log_file "$locomotive_id")"
  if [[ ! -f "$log_path" ]]; then
    echo "missing log file: $log_path" >&2
    exit 1
  fi

  tail -n 50 -f "$log_path"
}

start_all() {
  local index locomotive_id port
  for index in "${!LOCOMOTIVES[@]}"; do
    locomotive_id="${LOCOMOTIVES[$index]}"
    port="$(instance_port "$index")"
    start_one "$locomotive_id" "$port"
  done
}

stop_all() {
  local locomotive_id
  for locomotive_id in "${LOCOMOTIVES[@]}"; do
    stop_one "$locomotive_id"
  done
}

usage() {
  cat <<EOF
Usage: $0 [start|stop|status|logs] [LOCOMOTIVE_ID]

Commands:
  start              Start 10 local locomotive instances
  stop               Stop all local locomotive instances
  status             Show instance status, ports, and log files
  logs LOCOMOTIVE_ID Tail one instance log file

Environment overrides:
  PYTHON_BIN                     Python interpreter to use (default: python3)
  LOCOMOTIVE_HOST                Bind address for uvicorn (default: 127.0.0.1)
  PATTERN_INSTANCE_BASE_PORT     First port to use (default: 3101)
  KAFKA_BOOTSTRAP_SERVERS        Kafka broker (default: localhost:9092)
  KAFKA_ENABLED                  Kafka publish flag (default: true)
EOF
}

main() {
  local action="${1:-status}"

  case "$action" in
    start)
      start_all
      ;;
    stop)
      stop_all
      ;;
    status)
      status_all
      ;;
    logs)
      if [[ $# -lt 2 ]]; then
        echo "logs requires a LOCOMOTIVE_ID" >&2
        exit 1
      fi
      logs_one "$2"
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
