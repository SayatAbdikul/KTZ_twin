from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Iterator
import time

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import DATABASE_URL, DB_ECHO

_engine = create_engine(DATABASE_URL, echo=DB_ECHO, future=True, pool_pre_ping=True)
_SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False, future=True)


@contextmanager
def session_scope() -> Iterator[Session]:
    session = _SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def init_db_schema() -> None:
    alembic_cfg = Config(str(Path(__file__).with_name("alembic.ini")))
    command.upgrade(alembic_cfg, "head")


def db_ping() -> bool:
    try:
        with _engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


def wait_for_db(max_attempts: int = 30, sleep_s: float = 1.0) -> bool:
    for _ in range(max_attempts):
        if db_ping():
            return True
        time.sleep(sleep_s)
    return False
