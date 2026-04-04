# Health Index Rules

## Goal

This document defines backend rules for deriving a locomotive health index and raw alarms from the reduced telemetry stream produced by `generate_core_synthetic_telemetry.py`.

The health index should not be generated inside the seeding script. It should be computed downstream from raw telemetry.

## Input Telemetry

The health logic uses these raw fields:

- `speed_kmh`
- `adhesion_coeff`
- `traction_current_a`
- `brake_pipe_pressure_bar`
- `brake_cylinder_pressure_bar`
- `traction_motor_temp_c`
- `bearing_temp_c`
- `fault_code`
- `catenary_voltage_kv`
- `transformer_temp_c`
- `fuel_level_l`
- `fuel_rate_lph`
- `oil_pressure_bar`
- `coolant_temp_c`

## Current Schema Limits And Proxies

Some of the requested causal rules depend on signals that are not yet present in the reduced telemetry schema.

Current proxy strategy:

- use speed change over time as an acceleration proxy
- use `brake_pipe_pressure_bar` as the nearest available proxy for reservoir or pneumatic brake health
- use `adhesion_coeff` plus current-vs-acceleration mismatch as a proxy for slip-like behavior
- use `bearing_temp_c` without matching electrical load as a proxy for a developing mechanical fault

Signals that would improve these rules later:

- brake reservoir pressure
- compressor duty or compressor current
- vibration
- wheel-slip alarm count
- sander state

## Processing Windows

Use rolling windows rather than single-sample decisions.

Recommended windows:

- fast window: `1s`
- short window: `5s`
- stability window: `30s`

Use the fast and short windows for alarms. Use the short and stability windows for the health index.

## Derived Backend Features

Before applying rules, compute:

- `speed_1s_avg`
- `speed_5s_avg`
- `speed_30s_avg`
- `adhesion_5s_avg`
- `current_5s_avg`
- `brake_pipe_1s_avg`
- `brake_cyl_1s_avg`
- `motor_temp_30s_avg`
- `bearing_temp_30s_avg`
- `transformer_temp_30s_avg` for `KZ8A`
- `coolant_temp_30s_avg` for `TE33A`
- `oil_pressure_5s_avg` for `TE33A`
- `fuel_rate_30s_avg` for `TE33A`

Also compute:

- `speed_drop_3s = speed_3s_ago - speed_now`
- `accel_3s_est_mps2 = (speed_now - speed_3s_ago) / 3 / 3.6`
- `high_speed = speed_1s_avg >= 60`
- `medium_speed = speed_1s_avg >= 30`
- `brake_command = brake_pipe_1s_avg < 4.6 or brake_cyl_1s_avg > 1.0`
- `hard_brake_command = brake_pipe_1s_avg < 4.3 or brake_cyl_1s_avg > 2.0`
- `not_braking = brake_pipe_1s_avg > 4.8 and brake_cyl_1s_avg < 0.4`
- `high_current_low_accel = current_5s_avg > 650 and accel_3s_est_mps2 < 0.05 and not_braking and speed_1s_avg < 70`
- `weak_brake_response = hard_brake_command and brake_cyl_1s_avg < 0.8 and speed_1s_avg > 40`
- `mechanical_mismatch = bearing_temp_30s_avg > 80 and current_5s_avg < 350 and motor_temp_30s_avg < 90`
- `slip_like_event = adhesion_5s_avg < 0.18 and high_current_low_accel`
- `slip_like_events_10m = count of slip_like_event windows in trailing 10 minutes`

## Health Index Structure

Start from `100`.


Calculate four domain scores:

1. braking score
2. thermal score
3. traction and powertrain score
4. fault score

Then calculate final health index:

```text
health_index =
    0.40 * braking_score +
    0.25 * thermal_score +
    0.20 * powertrain_score +
    0.15 * fault_score
```

Round to integer and clamp to `0..100`.

Braking is weighted highest because it is the most safety-critical domain.

## Health Bands

- `85..100` = normal
- `70..84` = watch
- `50..69` = warning
- `0..49` = critical

## Domain Rules

### 1. Braking score

Start with `100`.

Apply penalties:

- `-10` if `adhesion_5s_avg < 0.20` while `speed_1s_avg > 40`
- `-20` if `adhesion_5s_avg < 0.16` while `speed_1s_avg > 40`
- `-10` if `brake_pipe_1s_avg < 4.8` while `speed_1s_avg > 40`
- `-20` if `brake_pipe_1s_avg < 4.5` while `speed_1s_avg > 40`
- `-25` if `hard_brake_command` is true and `speed_drop_3s < 5 km/h`
- `-35` if `hard_brake_command` is true and `brake_cyl_1s_avg < 0.8` while `speed_1s_avg > 50`
- `-20` if `brake_pipe_1s_avg < 3.8` for more than `2s`
- `-20` if `weak_brake_response` is true for `>= 3s`
- `-20` if `brake_pipe_1s_avg` is falling but `brake_cyl_1s_avg` does not rise as expected for `>= 3s`

Interpretation:

- falling brake pipe with poor response suggests compressor, leak, valve, or brake-system weakness
- low brake cylinder under braking demand means weak brake response
- if speed stays high despite hard brake demand, braking effectiveness is poor
- since reservoir pressure is not available yet, `brake_pipe_pressure_bar` is used as the current pneumatic proxy

Clamp the braking score to `0..100`.

### 2. Thermal score

Start with `100`.

Apply common penalties:

- `-10` if `motor_temp_30s_avg > 95`
- `-20` if `motor_temp_30s_avg > 105`
- `-10` if `bearing_temp_30s_avg > 75`
- `-20` if `bearing_temp_30s_avg > 85`
- `-20` if `current_5s_avg > 700` for `>= 10s` and `motor_temp_30s_avg > 95`
- `-30` if `current_5s_avg > 850` for `>= 10s` and `motor_temp_30s_avg > 105`
- `-25` if `mechanical_mismatch` is true for `>= 10s`

For `KZ8A`:

- `-15` if `transformer_temp_30s_avg > 95`
- `-30` if `transformer_temp_30s_avg > 110`

For `TE33A`:

- `-15` if `coolant_temp_30s_avg > 95`
- `-30` if `coolant_temp_30s_avg > 105`

Clamp the thermal score to `0..100`.

### 3. Traction And Powertrain score

Start with `100`.

For all locomotives:

- `-10` if `current_5s_avg > 700` for more than `5s`
- `-20` if `current_5s_avg > 900` for more than `5s`
- `-20` if `high_current_low_accel` is true for `>= 5s`
- `-30` if `high_current_low_accel` is true for `>= 10s`
- `-15` if `slip_like_events_10m >= 3`

Interpretation:

- high current with weak acceleration usually indicates low adhesion or excessive running resistance
- repeated slip-like episodes at normal operating speed suggest rail-condition, axle-control, or sanding-related problems

For `KZ8A`:

- `-15` if `catenary_voltage_kv < 23.0`
- `-30` if `catenary_voltage_kv < 21.5`
- add `-10` extra if `catenary_voltage_kv < 23.0` and `current_5s_avg > 500`

For `TE33A`:

- `-15` if `oil_pressure_5s_avg < 2.0`
- `-30` if `oil_pressure_5s_avg < 1.4`
- `-10` if `fuel_rate_30s_avg` is abnormally high for the current speed band

Suggested fuel-efficiency rule for `TE33A`:

- if `speed_30s_avg < 20` and `fuel_rate_30s_avg > 80`, apply `-10`
- if `20 <= speed_30s_avg < 50` and `fuel_rate_30s_avg > 140`, apply `-10`
- if `speed_30s_avg >= 50` and `fuel_rate_30s_avg > 220`, apply `-10`

Clamp the powertrain score to `0..100`.

### 4. Fault score

Start with `100`.

Apply penalties based on active raw fault code:

- `BRAKE_RESPONSE_WEAK` -> `-40`
- `KZ8A_VOLTAGE_DIP` -> `-20`
- `KZ8A_TRANSFORMER_HOT` -> `-35`
- `TE33A_OIL_LOW` -> `-30`
- `TE33A_COOLANT_HOT` -> `-35`

If no fault is active, no penalty applies.

Clamp the fault score to `0..100`.

## Alarm Rules

These alarms should be generated independently of the health index band. A severe rule should be able to raise an alarm even if the overall health index has not fallen far yet.

### Critical alarms

Raise `critical` immediately when any of these are true for `>= 1s`:

1. Weak braking at speed

```text
speed_1s_avg > 50
and hard_brake_command
and brake_cyl_1s_avg < 0.8
```

2. No deceleration despite hard braking

```text
speed_1s_avg > 60
and hard_brake_command
and speed_drop_3s < 5
```

3. Falling pneumatic pressure with bad brake response

```text
speed_1s_avg > 50
and brake_pipe_1s_avg < 4.3
and brake_cyl_1s_avg < 0.8
```

4. Low adhesion during braking at speed

```text
speed_1s_avg > 60
and hard_brake_command
and adhesion_5s_avg < 0.15
```

5. Severe KZ8A electrical stress

```text
catenary_voltage_kv < 21.5
and current_5s_avg > 500
```

6. Severe TE33A lubrication failure

```text
oil_pressure_5s_avg < 1.2
and speed_1s_avg > 20
```

7. Severe overheating after sustained load

```text
transformer_temp_30s_avg > 115
or coolant_temp_30s_avg > 108
or motor_temp_30s_avg > 110
```

8. Severe traction mismatch

```text
speed_1s_avg > 20
and high_current_low_accel
and adhesion_5s_avg < 0.16
```

### Warning alarms

Raise `warning` when any of these are true for `>= 3s`:

1. Brake degradation

```text
speed_1s_avg > 40
and brake_command
and brake_cyl_1s_avg < 1.0
```

2. Adhesion low at speed

```text
speed_1s_avg > 40
and adhesion_5s_avg < 0.18
```

3. High current but weak acceleration

```text
high_current_low_accel
```

4. Transformer hot

```text
transformer_temp_30s_avg > 100
```

5. Coolant hot

```text
coolant_temp_30s_avg > 98
```

6. Oil pressure low

```text
oil_pressure_5s_avg < 2.0
```

7. Voltage dip under load

```text
catenary_voltage_kv < 23.0
and current_5s_avg > 400
```

8. Mechanical mismatch

```text
bearing_temp_30s_avg > 80
and current_5s_avg < 350
and motor_temp_30s_avg < 90
```

### Watch alarms

Raise `watch` when any of these are true for `>= 5s`:

- `adhesion_5s_avg < 0.22`
- `motor_temp_30s_avg > 95`
- `bearing_temp_30s_avg > 75`
- `current_5s_avg > 700`
- `fuel_rate_30s_avg` outside expected band for current speed
- `slip_like_events_10m >= 2`

## Priority Rule

If multiple alarms are active at once:

- `critical` overrides `warning`
- `warning` overrides `watch`

## How Speed Should Affect Alarm Severity

Speed should amplify the severity of braking and lubrication faults.

Examples:

- low brake performance at `5 km/h` may be a warning
- the same condition at `70 km/h` should be critical
- low oil pressure at idle may be a watch
- low oil pressure while moving under load should be warning or critical

Recommended multiplier:

- low speed `< 10 km/h`: severity factor `0.5`
- medium speed `10..40 km/h`: severity factor `1.0`
- high speed `> 40 km/h`: severity factor `1.5`

Apply this factor to braking-related and oil-pressure-related penalty points.

## Example Rule From Your Scenario

If speed is high but brake-related telemetry indicates poor stopping capability, raise an alarm immediately.

Concrete implementation:

```text
if speed_1s_avg > 60
and brake_pipe_1s_avg < 4.3
and brake_cyl_1s_avg < 0.8:
    alarm = critical
    reason = "high_speed_brake_response_weak"
```

This is the exact type of rule that should override a normal-looking average health index.

## Requested Causal Mappings

These are the requested cause-effect rules translated into backend logic:

1. High current + weak acceleration

- likely interpretation: low adhesion or excessive resistance
- implementation: `high_current_low_accel`
- severity rises further if `adhesion_5s_avg` is also low

2. Falling pneumatic pressure + bad brake response

- likely interpretation: compressor issue, leak, valve issue, or brake-system fault
- implementation: use `brake_pipe_pressure_bar` as the current proxy until reservoir pressure is added
- condition: falling brake pipe plus weak brake cylinder response plus poor speed reduction

3. High motor temperature after prolonged high current

- likely interpretation: electrical or thermal overload
- implementation: sustained current window combined with elevated motor temperature

4. High bearing temperature without matching electrical load

- likely interpretation: mechanical fault developing
- implementation: `mechanical_mismatch`
- if vibration is added later, it should become the primary corroborating signal

5. Normal speed but repeated slip alarms

- likely interpretation: rail condition issue, axle-control issue, or sander issue
- current implementation: repeated `slip_like_event` windows based on low adhesion plus high current and weak acceleration
- recommended future improvement: add explicit wheel-slip alarm count and sanding state

## Implementation Advice

- compute health index from rolling windows, not raw samples
- emit alarms from rule evaluation first
- compute health band second
- keep rule thresholds in config so you can tune them with real or synthetic data
- treat raw `fault_code` as one input, not as the only source of truth
