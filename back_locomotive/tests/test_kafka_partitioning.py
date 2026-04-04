from __future__ import annotations

import importlib
import sys
import types
import unittest
from pathlib import Path


BACK_LOCOMOTIVE_ROOT = Path(__file__).resolve().parents[1]
if str(BACK_LOCOMOTIVE_ROOT) not in sys.path:
    sys.path.insert(0, str(BACK_LOCOMOTIVE_ROOT))


class _FakeAIOKafkaProducer:
    pass


class _FakeAIOKafkaAdminClient:
    pass


class _FakeNewTopic:
    def __init__(self, *, name: str, num_partitions: int, replication_factor: int) -> None:
        self.name = name
        self.num_partitions = num_partitions
        self.replication_factor = replication_factor


class _FakeNewPartitions:
    def __init__(self, *, total_count: int) -> None:
        self.total_count = total_count


class _FakeTopicAlreadyExistsError(Exception):
    pass


def _install_fake_aiokafka() -> None:
    aiokafka = types.ModuleType("aiokafka")
    aiokafka.AIOKafkaProducer = _FakeAIOKafkaProducer

    admin = types.ModuleType("aiokafka.admin")
    admin.AIOKafkaAdminClient = _FakeAIOKafkaAdminClient
    admin.NewTopic = _FakeNewTopic
    admin.NewPartitions = _FakeNewPartitions

    errors = types.ModuleType("aiokafka.errors")
    errors.TopicAlreadyExistsError = _FakeTopicAlreadyExistsError

    sys.modules["aiokafka"] = aiokafka
    sys.modules["aiokafka.admin"] = admin
    sys.modules["aiokafka.errors"] = errors


class KafkaPartitioningTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        _install_fake_aiokafka()
        cls.broker = importlib.import_module("app.broker")

    def test_topic_spec_defaults_to_100_partitions(self) -> None:
        topic = self.broker._topic_spec()
        self.assertEqual(topic.name, "ktz.locomotive.events")
        self.assertEqual(topic.num_partitions, 100)
        self.assertEqual(topic.replication_factor, 1)

    def test_partition_key_is_stable_per_locomotive(self) -> None:
        self.assertEqual(self.broker._partition_key_bytes(" KTZ-2001 "), b"KTZ-2001")

    def test_partition_count_extraction_handles_multiple_metadata_shapes(self) -> None:
        self.assertEqual(self.broker._extract_partition_count({"partitions": [1, 2, 3]}), 3)
        self.assertEqual(self.broker._extract_partition_count([{"partition": 0}, {"partition": 1}]), 2)


if __name__ == "__main__":
    unittest.main()
