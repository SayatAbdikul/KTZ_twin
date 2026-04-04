# Stress Testing

This repo currently exposes a websocket-heavy runtime:

- `back_dispatcher` opens one upstream websocket per configured locomotive
- each upstream emits `telemetry.frame` and optional events
- dispatcher recomputes health in-process and fans results out to dispatcher clients

That means the main stress dimensions are:

1. concurrent upstream locomotive connections
2. inbound telemetry rate
3. outbound fan-out to dispatcher websocket clients
4. burst behavior, especially when many locomotives or stations spike together

## Mapping Business Volumes To Load

Given target functional volumes:

- `100k` wagon / locomotive / train operations per day
- `160k` wagons
- `1700` locomotives
- `1k` trains per day on average in motion
- `937` stations where operations occur

For the current implementation, map them like this:

- `1700 locomotives` => `1700` concurrent upstream websocket connections to dispatcher
- `1k trains in motion` => at least `1000` hot telemetry streams during normal daytime load
- `100k ops/day` => average only `1.16 ops/s`, so peak tests must be burst-based, not average-based
- `937 stations` => operations are not evenly distributed, so test concentrated bursts rather than flat daily rate

Important limitation: wagon / station operations are not first-class contracts in the current backend. In stress tests they should be modeled as extra websocket events on top of telemetry, not as proof that business workflows are complete.

## Raw Telemetry vs Operational Events

Do not mix these into one rate.

- `100k ops/day` describes business operations such as wagon, train, and station events
- telemetry sampling may be much higher and must be modeled separately

If telemetry is generated every `1 ms` per locomotive, then for `1700` locomotives the dispatcher-side ingest target becomes:

- `1000 telemetry frames / second / locomotive`
- about `1.7 million telemetry frames / second` total before fan-out

That is several orders of magnitude above the current websocket JSON design.

For the current codebase, this distinction matters:

- raw telemetry sampling can exist at the locomotive edge or simulator layer
- dispatcher should usually consume either batched samples or reduced operational frames
- UI websocket fan-out should almost never receive every raw `1 ms` sample

If the real requirement is truly raw `1 ms` telemetry through dispatcher, then the current service is not just under-provisioned; it needs a different transport and processing architecture.

See [docs/TARGET_TELEMETRY_ARCHITECTURE.md](/home/martian/Documents/swe/KTZ_twin/docs/TARGET_TELEMETRY_ARCHITECTURE.md) for the proposed target design.

## Current Bottleneck To Watch

Dispatcher fan-out is currently synchronous per websocket client in [back_dispatcher/app/ws_server.py](/home/martian/Documents/swe/KTZ_twin/back_dispatcher/app/ws_server.py). One slow client can therefore degrade broadcast throughput. Stress results should be judged with that in mind.

## Tooling

Use [scripts/stress_dispatcher.py](/home/martian/Documents/swe/KTZ_twin/scripts/stress_dispatcher.py).

It provides:

- `print-targets`: generate `LOCOMOTIVE_TARGETS` for thousands of synthetic locomotives
- `mock-locomotives`: one websocket server that impersonates many locomotive backends
- `subscribers`: many dispatcher websocket clients with throughput and latency reporting

## Recommended Test Profiles

### 1. Upstream Baseline

Goal: verify dispatcher can hold all configured locomotives online.

- `1700` upstream locomotive connections
- `1 telemetry.frame / second / locomotive`
- `0` dispatcher clients
- duration: `15-30 min`

Expected dispatcher ingest:

- about `1700 msg/s`

This profile assumes dispatcher consumes reduced telemetry, not raw `1 ms` sampling.

### 1A. Raw Sampling Thought Experiment

Goal: quantify the actual order of magnitude if raw telemetry is forwarded directly.

- `1700` upstream locomotive connections
- `0.001 s` telemetry interval
- no subscribers first, then add subscribers separately

Expected dispatcher ingest:

- about `1,700,000 telemetry messages / second`

For the current Python websocket implementation this should be treated as a capacity gap analysis, not as an expected pass condition.

### 2. Baseline Fan-Out

Goal: verify steady-state dispatcher fan-out.

- baseline upstream load from profile 1
- `10-25` dispatcher clients subscribed to `all`
- duration: `15 min`

Expected dispatcher outbound message volume:

- telemetry + health updates for each moving stream
- if all clients subscribe to all locomotives, outbound grows linearly with client count

### 3. Peak Movement Burst

Goal: verify service under compressed peak windows.

- `1700` upstream locomotives
- base telemetry `1/s`
- every `300s`, burst to `2-3/s` for `60s`
- `25-50` dispatcher clients subscribed to `all`
- duration: `30 min`

This is a better proxy for operational peaks than daily averages.

### 4. Station Operations Burst

Goal: simulate concentrated station activity.

- baseline telemetry load
- extra `wagon.operation` event every `10-15s` per active locomotive subset, or equivalent aggregate burst
- station ids distributed across `937` stations
- `10-25` dispatcher clients

This does not validate business correctness of station workflows. It only stresses the event path.

### 5. Soak

Goal: catch memory growth, reconnect churn, and slow degradation.

- baseline upstream load
- `5-10` dispatcher clients
- duration: `8-24h`

## Example Run

Start mock locomotive backends:

```bash
python3 scripts/stress_dispatcher.py mock-locomotives \
  --host 127.0.0.1 \
  --port 8765 \
  --telemetry-interval-s 1 \
  --report-interval-s 5
```

Generate `LOCOMOTIVE_TARGETS` for dispatcher:

```bash
export LOCOMOTIVE_TARGETS="$(python3 scripts/stress_dispatcher.py print-targets \
  --locomotives 1700 \
  --base-url ws://127.0.0.1:8765/loco \
  --id-prefix KTZ)"
```

Start dispatcher:

```bash
cd back_dispatcher
uvicorn app.main:app --host 0.0.0.0 --port 3010
```

Start dispatcher-side subscribers:

```bash
python3 scripts/stress_dispatcher.py subscribers \
  --dispatcher-url ws://127.0.0.1:3010/ws \
  --clients 25 \
  --subscribe all \
  --locomotives 1700 \
  --run-seconds 900 \
  --report-interval-s 5
```

Peak burst example:

```bash
python3 scripts/stress_dispatcher.py mock-locomotives \
  --host 127.0.0.1 \
  --port 8765 \
  --telemetry-interval-s 1 \
  --burst-every-s 300 \
  --burst-duration-s 60 \
  --burst-multiplier 3
```

Raw-sampling experiment:

```bash
python3 scripts/stress_dispatcher.py mock-locomotives \
  --host 127.0.0.1 \
  --port 8765 \
  --telemetry-interval-s 0.001
```

Use this only to find failure points. It is not a realistic success target for the current dispatcher implementation.

## Runtime Metrics

During a run, inspect [back_dispatcher/app/routes/health.py](/home/martian/Documents/swe/KTZ_twin/back_dispatcher/app/routes/health.py):

- `GET /api/health`

It now returns `runtimeStats` with:

- websocket accepts / disconnects / peak clients
- total inbound messages by type
- total broadcast calls by type
- broadcast delivery attempts and failed deliveries

This is enough for first-pass load triage without adding Prometheus.

## Pass / Fail Suggestions

Treat the profile as failed if any of the following happen:

- dispatcher cannot keep all expected upstream locomotive connections stable
- subscriber latency grows monotonically during steady-state load
- broadcast delivery failures keep increasing under normal network conditions
- reconnect storms appear after short bursts
- memory or CPU grows continuously during soak

For websocket UX, a practical first target is:

- dispatcher envelope lag `p95 < 500 ms` in baseline fan-out
- no sustained backlog growth after burst windows end
