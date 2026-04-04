"""replay schema updates

Revision ID: 0002_replay_schema_updates
Revises: 0001_initial_dispatcher_db
Create Date: 2026-04-04
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0002_replay_schema_updates"
down_revision = "0001_initial_dispatcher_db"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("telemetry_points", sa.Column("source_event_id", sa.String(length=128), nullable=True))
    op.create_index(
        "ux_telemetry_points_source_event_metric",
        "telemetry_points",
        ["source_event_id", "metric_id"],
        unique=True,
        postgresql_where=sa.text("source_event_id IS NOT NULL"),
    )

    op.create_table(
        "health_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("locomotive_id", sa.String(length=64), nullable=False),
        sa.Column("ts", sa.BigInteger(), nullable=False),
        sa.Column("source_event_id", sa.String(length=128), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    )
    op.create_index("ix_health_snapshots_locomotive_id", "health_snapshots", ["locomotive_id"], unique=False)
    op.create_index("ix_health_snapshots_ts", "health_snapshots", ["ts"], unique=False)
    op.create_index("ix_health_snapshots_source_event_id", "health_snapshots", ["source_event_id"], unique=True)
    op.create_index("ix_health_snapshots_locomotive_ts", "health_snapshots", ["locomotive_id", "ts"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_health_snapshots_locomotive_ts", table_name="health_snapshots")
    op.drop_index("ix_health_snapshots_source_event_id", table_name="health_snapshots")
    op.drop_index("ix_health_snapshots_ts", table_name="health_snapshots")
    op.drop_index("ix_health_snapshots_locomotive_id", table_name="health_snapshots")
    op.drop_table("health_snapshots")

    op.drop_index("ux_telemetry_points_source_event_metric", table_name="telemetry_points")
    op.drop_column("telemetry_points", "source_event_id")
