"""normalize user role types

Revision ID: 0005_normalize_user_role_types
Revises: 0004_merge_dispatcher_heads
Create Date: 2026-04-05
"""

from __future__ import annotations

import time

from alembic import op
import sqlalchemy as sa


revision = "0005_normalize_user_role_types"
down_revision = "0004_merge_dispatcher_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    now_ms = int(time.time() * 1000)

    op.create_table(
        "role_types",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("label", sa.String(length=160), nullable=False),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
    )
    op.create_index("ix_role_types_code", "role_types", ["code"], unique=True)
    op.create_index("ix_role_types_created_at", "role_types", ["created_at"], unique=False)

    role_types_table = sa.table(
        "role_types",
        sa.column("code", sa.String(length=32)),
        sa.column("label", sa.String(length=160)),
        sa.column("created_at", sa.BigInteger()),
    )
    op.bulk_insert(
        role_types_table,
        [
            {"code": "dispatcher", "label": "Диспетчер", "created_at": now_ms},
            {"code": "regular_train", "label": "Локомотивная бригада", "created_at": now_ms},
        ],
    )

    op.add_column("users", sa.Column("role_type_id", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_index("ix_users_role_type_id", "users", ["role_type_id"], unique=False)
    op.create_index("ix_users_is_admin", "users", ["is_admin"], unique=False)
    op.create_foreign_key("fk_users_role_type_id", "users", "role_types", ["role_type_id"], ["id"])

    bind = op.get_bind()
    dispatcher_role_type_id = bind.execute(
        sa.text("SELECT id FROM role_types WHERE code = 'dispatcher'")
    ).scalar_one()
    regular_train_role_type_id = bind.execute(
        sa.text("SELECT id FROM role_types WHERE code = 'regular_train'")
    ).scalar_one()

    bind.execute(
        sa.text(
            """
            UPDATE users
            SET role_type_id = :dispatcher_role_type_id,
                is_admin = CASE WHEN role = 'admin' THEN TRUE ELSE FALSE END
            WHERE role IN ('admin', 'dispatcher')
            """
        ),
        {"dispatcher_role_type_id": dispatcher_role_type_id},
    )
    bind.execute(
        sa.text(
            """
            UPDATE users
            SET role_type_id = :regular_train_role_type_id,
                is_admin = FALSE
            WHERE role = 'train'
            """
        ),
        {"regular_train_role_type_id": regular_train_role_type_id},
    )

    op.alter_column("users", "role_type_id", nullable=False)
    op.drop_index("ix_users_role", table_name="users")
    op.drop_column("users", "role")
    op.alter_column("users", "is_admin", server_default=None)


def downgrade() -> None:
    op.add_column("users", sa.Column("role", sa.String(length=32), nullable=True))

    bind = op.get_bind()
    bind.execute(
        sa.text(
            """
            UPDATE users
            SET role = CASE
                WHEN is_admin THEN 'admin'
                WHEN role_type_id = (SELECT id FROM role_types WHERE code = 'dispatcher') THEN 'dispatcher'
                WHEN role_type_id = (SELECT id FROM role_types WHERE code = 'regular_train') THEN 'train'
                ELSE 'dispatcher'
            END
            """
        )
    )

    op.alter_column("users", "role", nullable=False)
    op.create_index("ix_users_role", "users", ["role"], unique=False)

    op.drop_constraint("fk_users_role_type_id", "users", type_="foreignkey")
    op.drop_index("ix_users_is_admin", table_name="users")
    op.drop_index("ix_users_role_type_id", table_name="users")
    op.drop_column("users", "is_admin")
    op.drop_column("users", "role_type_id")

    op.drop_index("ix_role_types_created_at", table_name="role_types")
    op.drop_index("ix_role_types_code", table_name="role_types")
    op.drop_table("role_types")
