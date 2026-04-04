# Synthetic Locomotive Telemetry Seeding

## Purpose

This document describes the rules used by `generate_synthetic_telemetry.py` to seed raw locomotive telemetry for a hackathon demo. The script generates only raw telemetry. It does not generate:

- `health_index`
- `health_band`
- derived alerts tables
- dispatcher commands tables
- external API calls
- LLM calls

The output is intended for a realtime-style digital twin dashboard and backend experimentation.

## Output Files

The script writes a single telemetry dataset to:

- `synthetic_output/telemetry.csv`
- `synthetic_output/telemetry.jsonl`
- optional `synthetic_output/telemetry.parquet` if parquet support is available

It also prints:

- total row count
- rows per locomotive
- min and max timestamps
- locomotive types present

## Dataset Scope

- Exactly `3` locomotives
- Total rows target: about `1,000,000`
- Frequency: `1000 Hz`
- Step size: `1 ms`
- Timestamps are strictly increasing within each locomotive stream
- Data is generated locomotive-by-locomotive, then concatenated

## Locomotives Seeded

The default seed script creates:

1. `KZ8A-001` of type `KZ8A`
2. `TE33A-002` of type `TE33A`
3. `KZ8A-003` of type `KZ8A`

This guarantees:

- at least one `KZ8A`
- at least one `TE33A`
- the third locomotive is valid per the hackathon requirement

## Geography Rules

Three plausible route-like paths are defined between major Kazakhstan cities:

1. Almaty -> Konaev -> Balkhash -> Karaganda -> Astana
2. Shymkent -> Turkistan -> Kyzylorda -> Shalkar -> Aktobe
3. Almaty -> Taldykorgan -> Ayagoz -> Semey -> Oskemen

Generation rules:

- GPS stays within Kazakhstan bounding limits
- Movement follows interpolated route geometry
- No random point jumps
- Heading is derived from route direction and then smoothed
- Each locomotive starts partway along its assigned corridor using a route start fraction

## Determinism

The generator is deterministic.

- Global seed constant: `RANDOM_SEED = 42`
- Each locomotive gets a derived seed: `RANDOM_SEED + index * 10_000`

This means repeated runs with the same script and dependencies should produce the same telemetry.

## Motion Model Rules

The motion model is not column-independent random noise. Each locomotive progresses through repeated operating phases:

1. `idle`
2. `acceleration`
3. `cruise`
4. `braking`
5. `stop`

Rules:

- Speed is built from phase targets and then smoothed
- Acceleration is derived from speed over time
- Distance is integrated from speed
- Route position comes from cumulative distance along the assigned corridor
- Heading changes gradually because route interpolation is continuous
- Stopped phases force near-zero speed rather than exact random jitter

## Load And Thermal Rules

An internal load signal is derived from:

- speed
- positive acceleration
- synthetic route grade factor

This load signal drives multiple dependent channels:

- `traction_current_a`
- `traction_motor_temp_c`
- `bearing_temp_c`
- diesel engine behavior for `TE33A`
- transformer behavior for `KZ8A`

Rules:

- Higher acceleration and load increase traction current
- Braking suppresses traction current
- Motor temperature responds faster to sustained load
- Bearing temperature responds more slowly than motor temperature
- Battery voltage sags slightly under load

## Brake Rules

Braking state is inferred from negative acceleration.

Rules:

- During braking, `brake_cylinder_pressure_bar` rises
- As brake cylinder pressure rises, `brake_pipe_pressure_bar` drops
- Braking coincides with falling speed

## KZ8A Rules

Applies only to electric locomotives.

Generated fields:

- `catenary_voltage_kv`
- `transformer_temp_c`

Rules:

- Catenary voltage is fairly stable around nominal overhead supply with moderate noise
- Higher sustained traction load increases transformer temperature
- Electric fields are populated only for `KZ8A`
- Diesel-only fields are not applicable and are stored as nulls in outputs

### KZ8A anomaly windows

The script injects sustained anomaly windows such as:

- catenary voltage dip
- transformer overheating

Typical effects:

- `catenary_voltage_kv` drops for several seconds
- `transformer_temp_c` rises above normal trend
- `fault_code` is set during the anomaly window

## TE33A Rules

Applies only to diesel-electric locomotives.

Generated fields:

- `engine_rpm`
- `coolant_temp_c`
- `oil_pressure_bar`
- `fuel_level_l`
- `fuel_rate_lph`

Rules:

- Engine RPM correlates with motion and load
- Fuel rate rises with load and RPM
- Fuel level declines monotonically over time
- Coolant temperature responds to sustained high load
- Oil pressure scales with RPM and degrades under some anomaly windows
- Electric-only fields are not applicable and are stored as nulls in outputs

### TE33A anomaly windows

The script injects sustained anomaly windows such as:

- low oil pressure
- elevated coolant temperature

Typical effects:

- `oil_pressure_bar` drops for several seconds
- `coolant_temp_c` climbs above normal trend
- `fuel_rate_lph` may increase during stressed operation
- `fault_code` is set during the anomaly window

## Communications Rules

Communications quality is mostly healthy.

Rules:

- `comms_status` is usually `online`
- Short windows of `degraded` status are injected
- Shorter `offline` windows are also injected
- Fault codes may be attached during those windows if no more specific anomaly is already present

## Null Semantics

Type-specific fields that do not apply are stored as `np.nan` during generation so pandas keeps numeric column types.

Effective output behavior:

- In `JSONL`, these become `null`
- In `CSV`, these usually appear as empty cells
- Semantically, they mean "not applicable", not "zero"

Examples:

- `KZ8A` rows have null diesel fields
- `TE33A` rows have null electric fields

## Quality Constraints Enforced

The script validates:

- latitude within Kazakhstan-safe bounds
- longitude within Kazakhstan-safe bounds
- `t_ms` increases by exactly `1` per locomotive
- timestamps are strictly increasing per locomotive
- `fuel_level_l` never increases for `TE33A`

Additional clipping prevents impossible values such as:

- negative speed
- negative traction current
- negative brake pressures
- implausible temperature or voltage excursions outside configured limits

## Telemetry Schema

This is the raw telemetry schema produced by the generator.

| Column | Type | Nullable | Applies To | Description |
|---|---|---:|---|---|
| `timestamp` | `TIMESTAMP(3)` or text ISO 8601 | No | all | Event time with millisecond precision |
| `t_ms` | `BIGINT` | No | all | Relative time in milliseconds from locomotive stream start |
| `locomotive_id` | `VARCHAR(32)` | No | all | Stable locomotive identifier |
| `locomotive_type` | `VARCHAR(16)` or enum | No | all | `KZ8A` or `TE33A` |
| `latitude` | `DOUBLE PRECISION` | No | all | GPS latitude in Kazakhstan |
| `longitude` | `DOUBLE PRECISION` | No | all | GPS longitude in Kazakhstan |
| `speed_kmh` | `REAL` | No | all | Speed in km/h |
| `acceleration_mps2` | `REAL` | No | all | Longitudinal acceleration in m/s^2 |
| `heading_deg` | `REAL` | No | all | Heading in degrees 0-360 |
| `traction_current_a` | `REAL` | No | all | Traction current in amps |
| `battery_voltage_v` | `REAL` | No | all | Auxiliary battery voltage |
| `brake_pipe_pressure_bar` | `REAL` | No | all | Brake pipe pressure |
| `brake_cylinder_pressure_bar` | `REAL` | No | all | Brake cylinder pressure |
| `traction_motor_temp_c` | `REAL` | No | all | Traction motor temperature |
| `bearing_temp_c` | `REAL` | No | all | Bearing temperature |
| `fault_code` | `VARCHAR(64)` | Yes | all | Optional raw fault/anomaly code |
| `comms_status` | `VARCHAR(16)` or enum | No | all | `online`, `degraded`, `offline` |
| `catenary_voltage_kv` | `REAL` | Yes | KZ8A only | Overhead supply voltage |
| `transformer_temp_c` | `REAL` | Yes | KZ8A only | Transformer temperature |
| `engine_rpm` | `REAL` | Yes | TE33A only | Diesel engine RPM |
| `coolant_temp_c` | `REAL` | Yes | TE33A only | Engine coolant temperature |
| `oil_pressure_bar` | `REAL` | Yes | TE33A only | Engine oil pressure |
| `fuel_level_l` | `REAL` | Yes | TE33A only | Remaining fuel volume |
| `fuel_rate_lph` | `REAL` | Yes | TE33A only | Fuel burn rate |

## Recommended Relational Table Shape

If you want one raw telemetry table, this structure fits the generator cleanly:

```sql
create table telemetry_raw (
    timestamp timestamptz not null,
    t_ms bigint not null,
    locomotive_id varchar(32) not null,
    locomotive_type varchar(16) not null,
    latitude double precision not null,
    longitude double precision not null,
    speed_kmh real not null,
    acceleration_mps2 real not null,
    heading_deg real not null,
    traction_current_a real not null,
    battery_voltage_v real not null,
    brake_pipe_pressure_bar real not null,
    brake_cylinder_pressure_bar real not null,
    traction_motor_temp_c real not null,
    bearing_temp_c real not null,
    fault_code varchar(64) null,
    comms_status varchar(16) not null,
    catenary_voltage_kv real null,
    transformer_temp_c real null,
    engine_rpm real null,
    coolant_temp_c real null,
    oil_pressure_bar real null,
    fuel_level_l real null,
    fuel_rate_lph real null,
    primary key (locomotive_id, timestamp)
);
```

## Suggested Constraints

Useful table constraints:

- `locomotive_type in ('KZ8A', 'TE33A')`
- `comms_status in ('online', 'degraded', 'offline')`
- `speed_kmh >= 0`
- `traction_current_a >= 0`
- `battery_voltage_v > 0`
- `brake_pipe_pressure_bar >= 0`
- `brake_cylinder_pressure_bar >= 0`
- `bearing_temp_c > -50`
- `traction_motor_temp_c > -50`

Optional locomotive-type consistency checks:

- `KZ8A` rows should have null diesel fields
- `TE33A` rows should have null electric fields

## Known Modeling Simplifications

The generator is realistic enough for dashboards and backend demos, but it is still synthetic. It simplifies:

- exact railway GIS geometry
- exact physics and tractive effort curves
- detailed brake system dynamics
- true asset-specific control logic
- fleet-specific fault dictionaries

It is intended for plausible telemetry continuity, not engineering certification or operations-grade simulation.

