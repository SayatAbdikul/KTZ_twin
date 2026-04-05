"""add runtime configs table

Revision ID: 0006_runtime_configs
Revises: 0005_normalize_user_role_types
Create Date: 2026-04-05
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0006_runtime_configs"
down_revision = "0005_normalize_user_role_types"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "runtime_configs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("config_key", sa.String(length=128), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("updated_at", sa.BigInteger(), nullable=False),
    )
    op.create_index("ix_runtime_configs_config_key", "runtime_configs", ["config_key"], unique=True)
    op.create_index("ix_runtime_configs_updated_at", "runtime_configs", ["updated_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_runtime_configs_updated_at", table_name="runtime_configs")
    op.drop_index("ix_runtime_configs_config_key", table_name="runtime_configs")
    op.drop_table("runtime_configs")
