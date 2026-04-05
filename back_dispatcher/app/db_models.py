from __future__ import annotations

from sqlalchemy import BigInteger, Boolean, Float, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class RoleType(Base):
    __tablename__ = "role_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(160))
    created_at: Mapped[int] = mapped_column(BigInteger, index=True)


class DispatcherCommand(Base):
    __tablename__ = "dispatcher_commands"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    command_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    locomotive_id: Mapped[str] = mapped_column(String(64), index=True)
    body: Mapped[str] = mapped_column(Text)
    sender: Mapped[str] = mapped_column(String(32), default="dispatcher")
    sent_at: Mapped[int] = mapped_column(BigInteger, index=True)
    delivered: Mapped[bool] = mapped_column(Boolean, default=False)
    payload: Mapped[dict] = mapped_column(JSONB)


class IncomingMessage(Base):
    __tablename__ = "incoming_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    message_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    locomotive_id: Mapped[str] = mapped_column(String(64), index=True)
    body: Mapped[str] = mapped_column(Text)
    sender: Mapped[str] = mapped_column(String(32), default="locomotive")
    sent_at: Mapped[int] = mapped_column(BigInteger, index=True)
    payload: Mapped[dict] = mapped_column(JSONB)


class AlertEvent(Base):
    __tablename__ = "alert_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_type: Mapped[str] = mapped_column(String(32), index=True)
    alert_id: Mapped[str] = mapped_column(String(128), index=True)
    locomotive_id: Mapped[str] = mapped_column(String(64), index=True)
    severity: Mapped[str | None] = mapped_column(String(16), nullable=True)
    status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source: Mapped[str | None] = mapped_column(String(64), nullable=True)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    recommended_action: Mapped[str | None] = mapped_column(Text, nullable=True)
    triggered_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    resolved_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    seen_at: Mapped[int] = mapped_column(BigInteger, index=True)
    payload: Mapped[dict] = mapped_column(JSONB)


class TelemetryPoint(Base):
    __tablename__ = "telemetry_points"
    __table_args__ = (
        Index("ix_telemetry_points_loco_metric_ts", "locomotive_id", "metric_id", "ts"),
        Index(
            "ux_telemetry_points_source_event_metric",
            "source_event_id",
            "metric_id",
            unique=True,
            postgresql_where=text("source_event_id IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    locomotive_id: Mapped[str] = mapped_column(String(64), index=True)
    metric_id: Mapped[str] = mapped_column(String(128), index=True)
    ts: Mapped[int] = mapped_column(BigInteger, index=True)
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str | None] = mapped_column(String(32), nullable=True)
    quality: Mapped[str | None] = mapped_column(String(16), nullable=True)
    frame_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    source_event_id: Mapped[str | None] = mapped_column(String(128), nullable=True)


class HealthSnapshot(Base):
    __tablename__ = "health_snapshots"
    __table_args__ = (
        Index("ix_health_snapshots_locomotive_ts", "locomotive_id", "ts"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    locomotive_id: Mapped[str] = mapped_column(String(64), index=True)
    ts: Mapped[int] = mapped_column(BigInteger, index=True)
    source_event_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    payload: Mapped[dict] = mapped_column(JSONB)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        Index("ux_users_username", "username", unique=True, postgresql_where=text("username IS NOT NULL")),
        Index("ux_users_locomotive_id", "locomotive_id", unique=True, postgresql_where=text("locomotive_id IS NOT NULL")),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    role_type_id: Mapped[int] = mapped_column(ForeignKey("role_types.id"), index=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    username: Mapped[str | None] = mapped_column(String(128), nullable=True)
    display_name: Mapped[str] = mapped_column(String(160))
    locomotive_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    password_hash: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="active", index=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[int] = mapped_column(BigInteger, index=True)
    updated_at: Mapped[int] = mapped_column(BigInteger, index=True)
    last_login_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    role_type: Mapped[RoleType] = relationship()


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    __table_args__ = (
        Index("ix_auth_sessions_user_id_expires_at", "user_id", "expires_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    refresh_token_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    created_at: Mapped[int] = mapped_column(BigInteger, index=True)
    updated_at: Mapped[int] = mapped_column(BigInteger, index=True)
    expires_at: Mapped[int] = mapped_column(BigInteger, index=True)
    revoked_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True, index=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(128), nullable=True)


class AuthAuditEvent(Base):
    __tablename__ = "auth_audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_type: Mapped[str] = mapped_column(String(64), index=True)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    subject_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    session_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    success: Mapped[bool] = mapped_column(Boolean, default=True)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[int] = mapped_column(BigInteger, index=True)


class ApplicationLog(Base):
    __tablename__ = "application_logs"
    __table_args__ = (
        Index("ix_application_logs_service_created_at", "service", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[int] = mapped_column(BigInteger, index=True)
    service: Mapped[str] = mapped_column(String(64), index=True)
    level: Mapped[str] = mapped_column(String(16), index=True)
    logger_name: Mapped[str] = mapped_column(String(255), index=True)
    module: Mapped[str | None] = mapped_column(String(255), nullable=True)
    function: Mapped[str | None] = mapped_column(String(255), nullable=True)
    line_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    message: Mapped[str] = mapped_column(Text)
    exception: Mapped[str | None] = mapped_column(Text, nullable=True)
    context: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


class RuntimeConfig(Base):
    __tablename__ = "runtime_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    config_key: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    payload: Mapped[dict] = mapped_column(JSONB)
    updated_at: Mapped[int] = mapped_column(BigInteger, index=True)
