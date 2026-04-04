"""add application logs table

Revision ID: 0003_application_logs
Revises: 0002_replay_schema_updates
Create Date: 2026-04-05
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0003_application_logs"
down_revision = "0002_replay_schema_updates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "application_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("service", sa.String(length=64), nullable=False),
        sa.Column("level", sa.String(length=16), nullable=False),
        sa.Column("logger_name", sa.String(length=255), nullable=False),
        sa.Column("module", sa.String(length=255), nullable=True),
        sa.Column("function", sa.String(length=255), nullable=True),
        sa.Column("line_no", sa.Integer(), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("exception", sa.Text(), nullable=True),
        sa.Column("context", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.create_index("ix_application_logs_created_at", "application_logs", ["created_at"], unique=False)
    op.create_index("ix_application_logs_service", "application_logs", ["service"], unique=False)
    op.create_index("ix_application_logs_level", "application_logs", ["level"], unique=False)
    op.create_index("ix_application_logs_logger_name", "application_logs", ["logger_name"], unique=False)
    op.create_index(
        "ix_application_logs_service_created_at",
        "application_logs",
        ["service", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_application_logs_service_created_at", table_name="application_logs")
    op.drop_index("ix_application_logs_logger_name", table_name="application_logs")
    op.drop_index("ix_application_logs_level", table_name="application_logs")
    op.drop_index("ix_application_logs_service", table_name="application_logs")
    op.drop_index("ix_application_logs_created_at", table_name="application_logs")
    op.drop_table("application_logs")
