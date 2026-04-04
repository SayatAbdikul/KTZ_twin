from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path


BACK_LOCOMOTIVE_ROOT = Path(__file__).resolve().parents[1]
if str(BACK_LOCOMOTIVE_ROOT) not in sys.path:
    sys.path.insert(0, str(BACK_LOCOMOTIVE_ROOT))

from app.config import START_VALUES
from app.simulator import telemetry
from app.simulator.telemetry import aggregate_samples_to_frame, generate_frame
from app.state import state


def sample_values(speed: float, distance: float, fuel_level: float, oil_pressure: float) -> dict[str, float]:
    values = copy.copy(START_VALUES)
    values["motion.speed"] = speed
    values["motion.distance"] = distance
    values["fuel.level"] = fuel_level
    values["pressure.oil"] = oil_pressure
    return values


class TelemetryAggregationTest(unittest.TestCase):
    def setUp(self) -> None:
        state.raw_samples.clear()
        for buffer in state.history_buffer.values():
            buffer.clear()
        state.current_frame = None
        state.frame_counter = 0

    def test_aggregate_samples_to_frame_uses_average_and_last_value_metrics(self) -> None:
        samples = [
            (index * 100, sample_values(speed=float(index), distance=100.0 + index, fuel_level=80.0 - index, oil_pressure=3.0 + index))
            for index in range(10)
        ]

        frame = aggregate_samples_to_frame(samples, timestamp_ms=1_000)
        readings = {reading.metric_id: reading.value for reading in frame.readings}

        self.assertEqual(frame.timestamp, 1_000)
        self.assertAlmostEqual(readings["motion.speed"], 4.0, places=6)
        self.assertAlmostEqual(readings["pressure.oil"], 7.5, places=6)
        self.assertAlmostEqual(readings["motion.distance"], 109.0, places=6)
        self.assertAlmostEqual(readings["fuel.level"], 71.0, places=6)

    def test_generate_frame_aggregates_only_recent_one_second_window(self) -> None:
        stale_samples = [
            (0, sample_values(speed=100.0, distance=1000.0, fuel_level=50.0, oil_pressure=1.0)),
            (100, sample_values(speed=100.0, distance=1001.0, fuel_level=49.0, oil_pressure=1.0)),
        ]
        recent_samples = [
            (1_100, sample_values(speed=10.0, distance=2000.0, fuel_level=79.0, oil_pressure=4.0)),
            (1_200, sample_values(speed=20.0, distance=2001.0, fuel_level=78.0, oil_pressure=5.0)),
            (1_300, sample_values(speed=30.0, distance=2002.0, fuel_level=77.0, oil_pressure=6.0)),
        ]
        state.raw_samples.extend(stale_samples + recent_samples)

        frame = generate_frame()
        readings = {reading.metric_id: reading.value for reading in frame.readings}

        self.assertAlmostEqual(readings["motion.speed"], 20.0, places=6)
        self.assertAlmostEqual(readings["pressure.oil"], 5.0, places=6)
        self.assertAlmostEqual(readings["motion.distance"], 2002.0, places=6)
        self.assertAlmostEqual(readings["fuel.level"], 77.0, places=6)

    def test_generate_instance_frame_uses_single_fault_pattern_profile(self) -> None:
        original_profile = telemetry.ACTIVE_FAULT_PATTERN_PROFILE
        profile = telemetry.FAULT_PATTERN_PROFILES[0]
        telemetry.ACTIVE_FAULT_PATTERN_PROFILE = profile

        try:
            frame = telemetry.generate_instance_frame(timestamp_ms=1_234)
        finally:
            telemetry.ACTIVE_FAULT_PATTERN_PROFILE = original_profile

        readings = {reading.metric_id: reading.value for reading in frame.readings}

        self.assertEqual(frame.locomotive_id, profile.locomotive_id)
        self.assertEqual(frame.timestamp, 1_234)
        self.assertAlmostEqual(readings["motion.speed"], profile.metrics["motion.speed"], places=6)
        self.assertAlmostEqual(readings["motion.distance"], profile.base_distance_km, places=6)


if __name__ == "__main__":
    unittest.main()
