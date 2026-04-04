"""
Constants, metric definitions, and simulator configuration.
All values ported from front_locomotive/src/config/metrics.config.ts
and front_locomotive/src/config/app.config.ts.
"""

import os

LOCOMOTIVE_ID = "KTZ-2001"
PORT = 3001

# Kafka producer
KAFKA_ENABLED = os.getenv("KAFKA_ENABLED", "false").lower() == "true"
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
KAFKA_TOPIC_EVENTS = os.getenv("KAFKA_TOPIC_EVENTS", "ktz.locomotive.events")
KAFKA_TOPIC_PARTITIONS = int(os.getenv("KAFKA_TOPIC_PARTITIONS", "100"))
KAFKA_TOPIC_REPLICATION_FACTOR = int(os.getenv("KAFKA_TOPIC_REPLICATION_FACTOR", "1"))
PATTERN_FLEET_ENABLED = os.getenv("PATTERN_FLEET_ENABLED", "true").lower() == "true"
PATTERN_FLEET_INTERVAL_S = float(os.getenv("PATTERN_FLEET_INTERVAL_S", "1.0"))

# Timing intervals (seconds)
RAW_TELEMETRY_INTERVAL_S = float(os.getenv("RAW_TELEMETRY_INTERVAL_S", "0.1"))
TELEMETRY_INTERVAL_S = 1.0
HEALTH_INTERVAL_S = 5.0
HEARTBEAT_INTERVAL_S = 10.0
ALERT_CHECK_BASE_S = 20.0   # random between 20-40s
MESSAGE_CHECK_BASE_S = 60.0  # random between 60-120s

# History buffer: 1 hour at 1Hz
HISTORY_BUFFER_SIZE = 3600

# Simulator random-walk parameters
# delta = (random() - DRIFT_BIAS) * range * DRIFT_SCALE
DRIFT_BIAS = 0.48   # slight upward tendency
DRIFT_SCALE = 0.01  # 1% of range per step

def _cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:4173")
    return [s.strip() for s in raw.split(",") if s.strip()]


CORS_ORIGINS = _cors_origins()

# ---------------------------------------------------------------------------
# Metric definitions (14 total) — matches front_locomotive metrics.config.ts
# ---------------------------------------------------------------------------
METRIC_DEFINITIONS = [
    # Motion
    {
        "metricId": "motion.speed",
        "label": "Speed",
        "unit": "km/h",
        "group": "motion",
        "precision": 0,
        "min": 0,
        "max": 200,
        "warningHigh": 140,
        "criticalHigh": 160,
        "sparklineEnabled": True,
        "displayOrder": 1,
    },
    {
        "metricId": "motion.acceleration",
        "label": "Acceleration",
        "unit": "m/s²",
        "group": "motion",
        "precision": 2,
        "min": -5,
        "max": 5,
        "sparklineEnabled": False,
        "displayOrder": 2,
    },
    {
        "metricId": "motion.distance",
        "label": "Distance",
        "unit": "km",
        "group": "motion",
        "precision": 1,
        "min": 0,
        "max": 999999,
        "sparklineEnabled": False,
        "displayOrder": 3,
    },
    # Fuel
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
        "metricId": "fuel.consumption_rate",
        "label": "Consumption Rate",
        "unit": "L/h",
        "group": "fuel",
        "precision": 1,
        "min": 0,
        "max": 500,
        "warningHigh": 400,
        "sparklineEnabled": True,
        "displayOrder": 2,
    },
    # Thermal
    {
        "metricId": "thermal.coolant_temp",
        "label": "Coolant Temperature",
        "unit": "°C",
        "group": "thermal",
        "precision": 1,
        "min": 0,
        "max": 150,
        "warningLow": 10,
        "warningHigh": 95,
        "criticalHigh": 105,
        "sparklineEnabled": True,
        "displayOrder": 1,
    },
    {
        "metricId": "thermal.oil_temp",
        "label": "Oil Temperature",
        "unit": "°C",
        "group": "thermal",
        "precision": 1,
        "min": 0,
        "max": 160,
        "warningHigh": 110,
        "criticalHigh": 130,
        "sparklineEnabled": True,
        "displayOrder": 2,
    },
    {
        "metricId": "thermal.exhaust_temp",
        "label": "Exhaust Temperature",
        "unit": "°C",
        "group": "thermal",
        "precision": 0,
        "min": 0,
        "max": 700,
        "warningHigh": 550,
        "criticalHigh": 650,
        "sparklineEnabled": False,
        "displayOrder": 3,
    },
    # Pressure
    {
        "metricId": "pressure.brake_main",
        "label": "Brake Main Reservoir",
        "unit": "bar",
        "group": "pressure",
        "precision": 1,
        "min": 0,
        "max": 10,
        "warningLow": 7,
        "criticalLow": 5,
        "sparklineEnabled": True,
        "displayOrder": 1,
    },
    {
        "metricId": "pressure.brake_pipe",
        "label": "Brake Pipe",
        "unit": "bar",
        "group": "pressure",
        "precision": 1,
        "min": 0,
        "max": 6,
        "warningLow": 4.5,
        "criticalLow": 4.0,
        "sparklineEnabled": True,
        "displayOrder": 2,
    },
    {
        "metricId": "pressure.oil",
        "label": "Oil Pressure",
        "unit": "bar",
        "group": "pressure",
        "precision": 1,
        "min": 0,
        "max": 8,
        "warningLow": 3,
        "criticalLow": 2,
        "sparklineEnabled": False,
        "displayOrder": 3,
    },
    # Electrical
    {
        "metricId": "electrical.traction_voltage",
        "label": "Traction Voltage",
        "unit": "V",
        "group": "electrical",
        "precision": 0,
        "min": 0,
        "max": 3000,
        "warningLow": 2600,
        "criticalLow": 2400,
        "warningHigh": 2900,
        "criticalHigh": 3000,
        "sparklineEnabled": True,
        "displayOrder": 1,
    },
    {
        "metricId": "electrical.traction_current",
        "label": "Traction Current",
        "unit": "A",
        "group": "electrical",
        "precision": 0,
        "min": 0,
        "max": 2000,
        "warningHigh": 1600,
        "criticalHigh": 1800,
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
        "sparklineEnabled": False,
        "displayOrder": 3,
    },
]

# Lookup by metricId for fast threshold checks
METRIC_BY_ID: dict = {m["metricId"]: m for m in METRIC_DEFINITIONS}

# ---------------------------------------------------------------------------
# Subsystems and which metrics affect each one
# ---------------------------------------------------------------------------
SUBSYSTEMS = [
    {"subsystemId": "engine",    "label": "Engine"},
    {"subsystemId": "brakes",    "label": "Brakes"},
    {"subsystemId": "electrical","label": "Electrical"},
    {"subsystemId": "fuel",      "label": "Fuel System"},
    {"subsystemId": "cooling",   "label": "Cooling"},
    {"subsystemId": "pneumatic", "label": "Pneumatics"},
]

SUBSYSTEM_METRICS: dict[str, list[str]] = {
    "engine":     ["thermal.coolant_temp", "thermal.oil_temp", "thermal.exhaust_temp", "pressure.oil"],
    "brakes":     ["pressure.brake_main", "pressure.brake_pipe"],
    "electrical": ["electrical.traction_voltage", "electrical.traction_current", "electrical.battery_voltage"],
    "fuel":       ["fuel.level", "fuel.consumption_rate"],
    "cooling":    ["thermal.coolant_temp"],
    "pneumatic":  ["pressure.brake_main", "pressure.brake_pipe"],
}

# Starting metric values (matching front_locomotive MSW fixtures)
START_VALUES: dict[str, float] = {
    "motion.speed":               80.0,
    "motion.acceleration":         0.2,
    "motion.distance":          1250.5,
    "fuel.level":                 72.4,
    "fuel.consumption_rate":     180.0,
    "thermal.coolant_temp":       88.0,
    "thermal.oil_temp":           95.0,
    "thermal.exhaust_temp":      420.0,
    "pressure.brake_main":         8.5,
    "pressure.brake_pipe":         5.0,
    "pressure.oil":                4.5,
    "electrical.traction_voltage": 2750.0,
    "electrical.traction_current": 850.0,
    "electrical.battery_voltage":  108.0,
}

# Starting subsystem health scores
START_SCORES: dict[str, float] = {
    "engine":     92.0,
    "brakes":     87.0,
    "electrical": 95.0,
    "fuel":       84.0,
    "cooling":    91.0,
    "pneumatic":  88.0,
}

# Health score thresholds for status labels
HEALTH_STATUS_THRESHOLDS = {
    "normal":   80,
    "degraded": 60,
    "warning":  40,
    # below 40 → critical
}

# Penalty applied to subsystem score per metric threshold breach
THRESHOLD_PENALTY = {
    "warning":  5.0,
    "critical": 15.0,
}
