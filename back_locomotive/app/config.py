from __future__ import annotations

import os


def _split_csv_env(name: str, default: str) -> list[str]:
    raw = os.getenv(name, default)
    return [part.strip() for part in raw.split(",") if part.strip()]


APP_HOST = os.getenv("LOCOMOTIVE_HOST", "0.0.0.0")
APP_PORT = int(os.getenv("LOCOMOTIVE_PORT", "3001"))
CORS_ORIGINS = _split_csv_env("CORS_ORIGINS", "*")

TELEMETRY_CSV_PATH = os.getenv("TELEMETRY_CSV_PATH", "./synthetic_output_core/telemetry.csv")
REPLAY_SPEED = float(os.getenv("REPLAY_SPEED", "1.0"))
LOOP_REPLAY = os.getenv("LOOP_REPLAY", "true").strip().lower() in {"1", "true", "yes", "on"}
FRONTEND_LOCOMOTIVE_ID = os.getenv("FRONTEND_LOCOMOTIVE_ID", "").strip() or None

KAFKA_ENABLED = os.getenv("KAFKA_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}
KAFKA_BOOTSTRAP_SERVERS = _split_csv_env("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
KAFKA_TOPIC_TELEMETRY = os.getenv("KAFKA_TOPIC_TELEMETRY", "locomotive.telemetry.raw")
KAFKA_CLIENT_ID = os.getenv("KAFKA_CLIENT_ID", "back-locomotive")

HEARTBEAT_INTERVAL_S = float(os.getenv("HEARTBEAT_INTERVAL_S", "10"))
HISTORY_BUFFER_SIZE = int(os.getenv("HISTORY_BUFFER_SIZE", "3600"))
TE33A_TANK_CAPACITY_L = float(os.getenv("TE33A_TANK_CAPACITY_L", "6000"))


METRIC_DEFINITIONS = [
    {
        "metricId": "motion.speed",
        "label": "Speed",
        "unit": "km/h",
        "group": "motion",
        "precision": 1,
        "min": 0,
        "max": 200,
        "warningHigh": 140,
        "criticalHigh": 160,
        "sparklineEnabled": True,
        "displayOrder": 1,
    },
    {
        "metricId": "motion.adhesion",
        "label": "Adhesion Coefficient",
        "unit": "",
        "group": "motion",
        "precision": 2,
        "min": 0,
        "max": 1,
        "warningLow": 0.18,
        "criticalLow": 0.12,
        "sparklineEnabled": True,
        "displayOrder": 2,
    },
    {
        "metricId": "fuel.level",
        "label": "Fuel Level",
        "unit": "%",
        "group": "fuel",
        "precision": 1,
        "min": 0,
        "max": 100,
        "warningLow": 20,
        "criticalLow": 10,
        "sparklineEnabled": True,
        "displayOrder": 1,
    },
    {
        "metricId": "fuel.level_l",
        "label": "Fuel Level",
        "unit": "L",
        "group": "fuel",
        "precision": 0,
        "min": 0,
        "max": TE33A_TANK_CAPACITY_L,
        "sparklineEnabled": True,
        "displayOrder": 2,
    },
    {
        "metricId": "fuel.consumption_rate",
        "label": "Fuel Rate",
        "unit": "L/h",
        "group": "fuel",
        "precision": 1,
        "min": 0,
        "max": 400,
        "warningHigh": 280,
        "criticalHigh": 320,
        "sparklineEnabled": True,
        "displayOrder": 3,
    },
    {
        "metricId": "thermal.coolant_temp",
        "label": "Coolant Temperature",
        "unit": "°C",
        "group": "thermal",
        "precision": 1,
        "min": 0,
        "max": 140,
        "warningHigh": 95,
        "criticalHigh": 105,
        "sparklineEnabled": True,
        "displayOrder": 1,
    },
    {
        "metricId": "thermal.traction_motor_temp",
        "label": "Traction Motor Temperature",
        "unit": "°C",
        "group": "thermal",
        "precision": 1,
        "min": 0,
        "max": 160,
        "warningHigh": 105,
        "criticalHigh": 120,
        "sparklineEnabled": True,
        "displayOrder": 2,
    },
    {
        "metricId": "thermal.bearing_temp",
        "label": "Bearing Temperature",
        "unit": "°C",
        "group": "thermal",
        "precision": 1,
        "min": 0,
        "max": 120,
        "warningHigh": 85,
        "criticalHigh": 95,
        "sparklineEnabled": True,
        "displayOrder": 3,
    },
    {
        "metricId": "thermal.transformer_temp",
        "label": "Transformer Temperature",
        "unit": "°C",
        "group": "thermal",
        "precision": 1,
        "min": 0,
        "max": 160,
        "warningHigh": 120,
        "criticalHigh": 135,
        "sparklineEnabled": True,
        "displayOrder": 4,
    },
    {
        "metricId": "pressure.brake_pipe",
        "label": "Brake Pipe Pressure",
        "unit": "bar",
        "group": "pressure",
        "precision": 2,
        "min": 0,
        "max": 6,
        "warningLow": 4.3,
        "criticalLow": 3.8,
        "sparklineEnabled": True,
        "displayOrder": 1,
    },
    {
        "metricId": "pressure.brake_cylinder",
        "label": "Brake Cylinder Pressure",
        "unit": "bar",
        "group": "pressure",
        "precision": 2,
        "min": 0,
        "max": 6,
        "warningHigh": 4.6,
        "criticalHigh": 5.0,
        "sparklineEnabled": True,
        "displayOrder": 2,
    },
    {
        "metricId": "pressure.oil",
        "label": "Oil Pressure",
        "unit": "bar",
        "group": "pressure",
        "precision": 2,
        "min": 0,
        "max": 8,
        "warningLow": 3,
        "criticalLow": 2,
        "sparklineEnabled": True,
        "displayOrder": 3,
    },
    {
        "metricId": "electrical.traction_current",
        "label": "Traction Current",
        "unit": "A",
        "group": "electrical",
        "precision": 0,
        "min": 0,
        "max": 2000,
        "warningHigh": 900,
        "criticalHigh": 1100,
        "sparklineEnabled": True,
        "displayOrder": 1,
    },
    {
        "metricId": "electrical.catenary_voltage",
        "label": "Catenary Voltage",
        "unit": "kV",
        "group": "electrical",
        "precision": 2,
        "min": 0,
        "max": 30,
        "warningLow": 23,
        "criticalLow": 20,
        "sparklineEnabled": True,
        "displayOrder": 2,
    },
    {
        "metricId": "electrical.battery_voltage",
        "label": "Battery Voltage",
        "unit": "V",
        "group": "electrical",
        "precision": 1,
        "min": 0,
        "max": 120,
        "warningLow": 100,
        "criticalLow": 90,
        "sparklineEnabled": True,
        "displayOrder": 3,
    },
]

METRIC_BY_ID = {metric["metricId"]: metric for metric in METRIC_DEFINITIONS}
