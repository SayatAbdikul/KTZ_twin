# Target Telemetry Architecture

This document describes a target architecture for the case where locomotive telemetry may be sampled at up to `1 ms` intervals.

It is intentionally different from the current runtime in this repo.

The current implementation is:

- Python `FastAPI` services
- websocket ingestion from locomotive simulators
- in-process health calculation
- websocket fan-out to UIs

That design is acceptable for low-rate demo traffic. It is not a defensible target for raw `1 ms` telemetry across `1700` locomotives.

## 1. Design Premise

There are two very different traffic classes:

1. raw telemetry samples
2. operational events

They must not share the same pipeline end-to-end.

Raw telemetry characteristics:

- high frequency
- ordered by source
- append-only
- mostly machine-consumed
- suitable for batching and stream processing

Operational event characteristics:

- much lower volume
- business-facing
- directly relevant to dispatchers and workflows
- suitable for API and UI exposure

## 2. Reference Volumes

Assumptions from the requirement discussion:

- `1700` locomotives
- `160k` wagons
- `1000` trains in motion on average
- `937` stations
- `100k` business operations per day
- telemetry sampling can reach `1 ms`

If raw telemetry is emitted every `1 ms` per locomotive:

- `1000` telemetry messages / second / locomotive
- about `1.7 million` messages / second across `1700` locomotives

Even before fan-out, this is too high for:

- one websocket per locomotive into a Python app
- JSON per sample
- synchronous per-client broadcast
- UI delivery of all samples

## 3. Core Architecture Decision

The dispatcher service should not ingest and forward every raw sample individually.

Instead, the target system should have four layers:

1. edge acquisition
2. stream ingestion
3. stream processing and state materialization
4. API and UI delivery

```text
Locomotive sensors
  -> Edge collector on locomotive / depot gateway
  -> Batched binary publish to broker
  -> Stream processors / rule engines
  -> Hot state store + operational event store
  -> Dispatcher API / UI feed
```

## 4. Target Logical Topology

```text
locomotive sensors
  -> edge-collector
  -> Kafka / Redpanda
  -> telemetry-normalizer
  -> stream processors
  -> hot state store
  -> dispatcher-api
  -> websocket gateway for UI

operational systems
  -> operations-api
  -> operations topic / database
  -> dispatcher-api
  -> websocket gateway for UI
```

## 5. Service Responsibilities

### 5.1 Edge Collector

Deploy close to the telemetry source.

Responsibilities:

- read raw sensor frames
- timestamp as close to source as possible
- buffer for short network interruptions
- batch samples into frames, for example `50 ms`, `100 ms`, or `250 ms`
- encode in compact binary format
- publish to broker with locomotive-scoped partition key

It should not:

- do UI fan-out
- expose raw sensor rate directly to browsers

### 5.2 Broker

Use Kafka-compatible streaming infrastructure.

Responsibilities:

- durable ordered log
- partitioned horizontal scale
- replay support
- decoupling between producers and consumers

Topic families:

- `telemetry.raw`
- `telemetry.aggregated.1s`
- `telemetry.aggregated.5s`
- `health.events`
- `alerts.events`
- `operations.events`
- `dispatcher.messages`

Partitioning rule:

- partition by `locomotive_id`

That preserves per-locomotive ordering and makes stateful processing tractable.

### 5.3 Telemetry Normalizer

Responsibilities:

- validate edge payloads
- reject malformed frames
- attach metadata such as schema version, source id, ingestion timestamp
- convert transport framing into canonical internal schema

This is where schema evolution should be controlled.

### 5.4 Stream Processing Layer

Responsibilities:

- compute rolling windows
- derive health scores
- generate alerts
- detect anomalies
- create lower-rate aggregates for APIs and UI

Outputs:

- `1 s` locomotive summary for live dashboarding
- `5 s` or `10 s` aggregates for trend widgets
- alert and health events
- retained operational state

Technology options:

- Kafka Streams
- Flink
- Spark Structured Streaming
- custom consumers only if the rule set stays simple

For this workload, a real stream processing runtime is the safer default.

### 5.5 Hot State Store

Responsibilities:

- latest state by locomotive
- recent alert state
- recent message state
- latest station / train operational view

Typical fit:

- Redis for very hot ephemeral state
- ClickHouse or TimescaleDB for queryable recent history
- object storage for long-term raw archives

### 5.6 Dispatcher API

Responsibilities:

- serve current state
- serve recent history
- expose dispatcher actions
- join operational data with telemetry-derived state

This service should work from materialized state, not from raw telemetry firehose.

### 5.7 WebSocket Gateway

Responsibilities:

- push low-rate UI updates
- manage subscriptions by locomotive, train, station, or region
- apply rate limits and backpressure
- disconnect slow clients cleanly

Target UI feed rates:

- live cards and maps: typically `1 Hz` to `2 Hz`
- fast operator screen: maybe `5 Hz`
- never raw `1 ms` per sample to browser clients

## 6. Data Contracts

Define at least three telemetry contracts.

### 6.1 Raw Edge Batch

Purpose:

- transport from edge collector to broker

Properties:

- binary
- batched
- schema-versioned
- compressed when possible

Payload shape should contain:

- `locomotive_id`
- `source_timestamp_min`
- `source_timestamp_max`
- repeated samples
- sequence range
- schema version

### 6.2 Operational Live Summary

Purpose:

- API and UI consumption

Properties:

- JSON is acceptable
- low rate
- one record per locomotive per interval

Fields should contain:

- speed
- traction
- brake state
- fuel
- temperatures
- derived health
- active alert count
- connectivity status

### 6.3 Business Event

Purpose:

- station, wagon, and train workflow

Examples:

- arrival
- departure
- shunting
- inspection
- locomotive assignment
- consist change

These events should stay explicit and business-readable.

## 7. Transport Choices

For raw telemetry:

- avoid websocket as primary ingestion transport
- avoid JSON per sample
- prefer gRPC streaming, TCP binary framing, MQTT, or a dedicated collector protocol into the edge layer

For service-to-service event transport:

- prefer Kafka-compatible broker

For browser delivery:

- websocket or SSE is fine, but only for reduced state streams

## 8. Backpressure Strategy

Backpressure must exist at every boundary.

### Edge

- local buffer with bounded retention
- batch before publish
- downsample non-critical metrics if retention risk is exceeded

### Broker

- producer retry and idempotence
- consumer lag monitoring
- partition rebalancing

### Processing

- bounded state windows
- separate raw and aggregate consumers
- dead-letter path for malformed records

### UI Gateway

- per-client send queues
- max queue depth
- drop policy for outdated telemetry snapshots
- disconnect policy for persistently slow clients

## 9. Storage Strategy

Use different stores for different access patterns.

Raw archive:

- object storage by date and locomotive
- Parquet or similar columnar format

Recent queryable telemetry:

- ClickHouse or TimescaleDB

Current live state:

- Redis or equivalent in-memory store

Business state:

- relational database for transactional workflows

Do not try to satisfy all use cases from one store.

## 10. Partitioning and Scale Guidance

The exact partition count depends on hardware and retention, but the direction is clear:

- partition by `locomotive_id`
- provision enough partitions to scale consumers horizontally
- keep ordering guarantees only where actually needed

At this requirement level, start by benchmarking:

- `1 s` batched publish from all locomotives
- `100 ms` batched publish from all locomotives
- worst-case reconnect storm
- replay and backfill load

If the business still insists on preserving `1 ms` raw samples, the system should carry them as batched records, not individual websocket JSON messages.

## 11. Reliability Requirements

Recommended minimum guarantees:

- at-least-once delivery on ingestion
- idempotent processing keys where duplicates are possible
- replayable raw telemetry log
- materialized latest state rebuildable from stream
- alert generation resilient to processor restart

## 12. Security and Governance

Needed controls:

- authenticated producers at edge
- topic ACLs
- schema registry and version checks
- audit trail for dispatcher actions
- retention policy by data class

## 13. Practical Migration From Current Repo

Phase 1:

- keep current simulator
- replace dispatcher direct websocket ingest with broker publish
- make dispatcher consume reduced telemetry topic instead of raw per-locomotive websocket

Phase 2:

- introduce dedicated stream processor for health and alert derivation
- move latest-state materialization out of dispatcher memory

Phase 3:

- split UI websocket gateway from dispatcher business API
- add per-client queues and subscription fan-out workers

Phase 4:

- introduce raw archive and replay pipeline
- onboard true edge collectors instead of in-process simulator

## 14. What This Means For The Current Code

Current code paths that do not scale to the target:

- one outbound websocket connection per locomotive in dispatcher
- JSON `telemetry.frame` per raw sample
- health computation inline with websocket receive loop
- synchronous fan-out in dispatcher websocket broadcast
- in-memory only latest state

Those are acceptable for demo and functional prototyping.

They should not be treated as the final architecture for `1 ms` telemetry.

## 15. Recommended Immediate Decision

Choose one of these explicitly:

1. `Dispatcher consumes reduced telemetry only`
2. `Dispatcher consumes raw telemetry batches but serves reduced state to UI`
3. `Dispatcher is removed from raw telemetry path entirely and only reads materialized state`

For this domain and volume, option `2` or `3` is usually the correct direction.
