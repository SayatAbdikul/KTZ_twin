from __future__ import annotations

from sqlalchemy import BigInteger, Boolean, Float, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


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
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    locomotive_id: Mapped[str] = mapped_column(String(64), index=True)
    metric_id: Mapped[str] = mapped_column(String(128), index=True)
    ts: Mapped[int] = mapped_column(BigInteger, index=True)
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str | None] = mapped_column(String(32), nullable=True)
    quality: Mapped[str | None] = mapped_column(String(16), nullable=True)
    frame_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
