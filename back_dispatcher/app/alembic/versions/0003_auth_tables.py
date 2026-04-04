"""auth tables

Revision ID: 0003_auth_tables
Revises: 0002_replay_schema_updates
Create Date: 2026-04-05
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0003_auth_tables"
down_revision = "0002_replay_schema_updates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("username", sa.String(length=128), nullable=True),
        sa.Column("display_name", sa.String(length=160), nullable=False),
        sa.Column("locomotive_id", sa.String(length=64), nullable=True),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("updated_at", sa.BigInteger(), nullable=False),
        sa.Column("last_login_at", sa.BigInteger(), nullable=True),
    )
    op.create_index("ix_users_role", "users", ["role"], unique=False)
    op.create_index("ix_users_status", "users", ["status"], unique=False)
    op.create_index("ix_users_created_at", "users", ["created_at"], unique=False)
    op.create_index("ix_users_updated_at", "users", ["updated_at"], unique=False)
    op.create_index(
        "ux_users_username",
        "users",
        ["username"],
        unique=True,
        postgresql_where=sa.text("username IS NOT NULL"),
    )
    op.create_index(
        "ux_users_locomotive_id",
        "users",
        ["locomotive_id"],
        unique=True,
        postgresql_where=sa.text("locomotive_id IS NOT NULL"),
    )

    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.String(length=128), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("refresh_token_hash", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("updated_at", sa.BigInteger(), nullable=False),
        sa.Column("expires_at", sa.BigInteger(), nullable=False),
        sa.Column("revoked_at", sa.BigInteger(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("ip_address", sa.String(length=128), nullable=True),
    )
    op.create_index("ix_auth_sessions_session_id", "auth_sessions", ["session_id"], unique=True)
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"], unique=False)
    op.create_index("ix_auth_sessions_refresh_token_hash", "auth_sessions", ["refresh_token_hash"], unique=True)
    op.create_index("ix_auth_sessions_created_at", "auth_sessions", ["created_at"], unique=False)
    op.create_index("ix_auth_sessions_updated_at", "auth_sessions", ["updated_at"], unique=False)
    op.create_index("ix_auth_sessions_expires_at", "auth_sessions", ["expires_at"], unique=False)
    op.create_index("ix_auth_sessions_revoked_at", "auth_sessions", ["revoked_at"], unique=False)
    op.create_index("ix_auth_sessions_user_id_expires_at", "auth_sessions", ["user_id", "expires_at"], unique=False)

    op.create_table(
        "auth_audit_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("subject_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("session_id", sa.String(length=128), nullable=True),
        sa.Column("success", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
    )
    op.create_index("ix_auth_audit_events_event_type", "auth_audit_events", ["event_type"], unique=False)
    op.create_index("ix_auth_audit_events_actor_user_id", "auth_audit_events", ["actor_user_id"], unique=False)
    op.create_index("ix_auth_audit_events_subject_user_id", "auth_audit_events", ["subject_user_id"], unique=False)
    op.create_index("ix_auth_audit_events_session_id", "auth_audit_events", ["session_id"], unique=False)
    op.create_index("ix_auth_audit_events_created_at", "auth_audit_events", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_auth_audit_events_created_at", table_name="auth_audit_events")
    op.drop_index("ix_auth_audit_events_session_id", table_name="auth_audit_events")
    op.drop_index("ix_auth_audit_events_subject_user_id", table_name="auth_audit_events")
    op.drop_index("ix_auth_audit_events_actor_user_id", table_name="auth_audit_events")
    op.drop_index("ix_auth_audit_events_event_type", table_name="auth_audit_events")
    op.drop_table("auth_audit_events")

    op.drop_index("ix_auth_sessions_user_id_expires_at", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_revoked_at", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_expires_at", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_updated_at", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_created_at", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_refresh_token_hash", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_user_id", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_session_id", table_name="auth_sessions")
    op.drop_table("auth_sessions")

    op.drop_index("ux_users_locomotive_id", table_name="users")
    op.drop_index("ux_users_username", table_name="users")
    op.drop_index("ix_users_updated_at", table_name="users")
    op.drop_index("ix_users_created_at", table_name="users")
    op.drop_index("ix_users_status", table_name="users")
    op.drop_index("ix_users_role", table_name="users")
    op.drop_table("users")
