"""initial dispatcher db schema

Revision ID: 0001_initial_dispatcher_db
Revises:
Create Date: 2026-04-04
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0001_initial_dispatcher_db"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "telemetry_points",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("locomotive_id", sa.String(length=64), nullable=False),
        sa.Column("metric_id", sa.String(length=128), nullable=False),
        sa.Column("ts", sa.BigInteger(), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(length=32), nullable=True),
        sa.Column("quality", sa.String(length=16), nullable=True),
        sa.Column("frame_id", sa.String(length=128), nullable=True),
    )
    op.create_index("ix_telemetry_points_locomotive_id", "telemetry_points", ["locomotive_id"], unique=False)
    op.create_index("ix_telemetry_points_metric_id", "telemetry_points", ["metric_id"], unique=False)
    op.create_index("ix_telemetry_points_ts", "telemetry_points", ["ts"], unique=False)
    op.create_index("ix_telemetry_points_loco_metric_ts", "telemetry_points", ["locomotive_id", "metric_id", "ts"], unique=False)

    op.create_table(
        "dispatcher_commands",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("command_id", sa.String(length=128), nullable=False),
        sa.Column("locomotive_id", sa.String(length=64), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("sender", sa.String(length=32), nullable=False),
        sa.Column("sent_at", sa.BigInteger(), nullable=False),
        sa.Column("delivered", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    )
    op.create_index("ix_dispatcher_commands_command_id", "dispatcher_commands", ["command_id"], unique=True)
    op.create_index("ix_dispatcher_commands_locomotive_id", "dispatcher_commands", ["locomotive_id"], unique=False)
    op.create_index("ix_dispatcher_commands_sent_at", "dispatcher_commands", ["sent_at"], unique=False)

    op.create_table(
        "incoming_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("message_id", sa.String(length=128), nullable=False),
        sa.Column("locomotive_id", sa.String(length=64), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("sender", sa.String(length=32), nullable=False),
        sa.Column("sent_at", sa.BigInteger(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    )
    op.create_index("ix_incoming_messages_message_id", "incoming_messages", ["message_id"], unique=True)
    op.create_index("ix_incoming_messages_locomotive_id", "incoming_messages", ["locomotive_id"], unique=False)
    op.create_index("ix_incoming_messages_sent_at", "incoming_messages", ["sent_at"], unique=False)

    op.create_table(
        "alert_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_type", sa.String(length=32), nullable=False),
        sa.Column("alert_id", sa.String(length=128), nullable=False),
        sa.Column("locomotive_id", sa.String(length=64), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=True),
        sa.Column("source", sa.String(length=64), nullable=True),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("recommended_action", sa.Text(), nullable=True),
        sa.Column("triggered_at", sa.BigInteger(), nullable=True),
        sa.Column("resolved_at", sa.BigInteger(), nullable=True),
        sa.Column("seen_at", sa.BigInteger(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    )
    op.create_index("ix_alert_events_event_type", "alert_events", ["event_type"], unique=False)
    op.create_index("ix_alert_events_alert_id", "alert_events", ["alert_id"], unique=False)
    op.create_index("ix_alert_events_locomotive_id", "alert_events", ["locomotive_id"], unique=False)
    op.create_index("ix_alert_events_seen_at", "alert_events", ["seen_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_telemetry_points_loco_metric_ts", table_name="telemetry_points")
    op.drop_index("ix_telemetry_points_ts", table_name="telemetry_points")
    op.drop_index("ix_telemetry_points_metric_id", table_name="telemetry_points")
    op.drop_index("ix_telemetry_points_locomotive_id", table_name="telemetry_points")
    op.drop_table("telemetry_points")

    op.drop_index("ix_alert_events_seen_at", table_name="alert_events")
    op.drop_index("ix_alert_events_locomotive_id", table_name="alert_events")
    op.drop_index("ix_alert_events_alert_id", table_name="alert_events")
    op.drop_index("ix_alert_events_event_type", table_name="alert_events")
    op.drop_table("alert_events")

    op.drop_index("ix_incoming_messages_sent_at", table_name="incoming_messages")
    op.drop_index("ix_incoming_messages_locomotive_id", table_name="incoming_messages")
    op.drop_index("ix_incoming_messages_message_id", table_name="incoming_messages")
    op.drop_table("incoming_messages")

    op.drop_index("ix_dispatcher_commands_sent_at", table_name="dispatcher_commands")
    op.drop_index("ix_dispatcher_commands_locomotive_id", table_name="dispatcher_commands")
    op.drop_index("ix_dispatcher_commands_command_id", table_name="dispatcher_commands")
    op.drop_table("dispatcher_commands")
