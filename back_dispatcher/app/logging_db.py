from __future__ import annotations

import logging
import threading
import traceback

from sqlalchemy import insert

from app.db import _engine
from app.db_models import ApplicationLog

_HANDLER_LOCK = threading.Lock()
_INSTALLED_HANDLER: "DatabaseLogHandler | None" = None
_SKIP_LOGGER_PREFIXES = ("sqlalchemy", "alembic")


class DatabaseLogHandler(logging.Handler):
    def __init__(self, service_name: str) -> None:
        super().__init__()
        self.service_name = service_name
        self._local = threading.local()

    def emit(self, record: logging.LogRecord) -> None:
        if record.name.startswith(_SKIP_LOGGER_PREFIXES):
            return

        if getattr(record, "_db_logged", False):
            return

        if getattr(self._local, "active", False):
            return

        self._local.active = True
        try:
            record._db_logged = True
            exception_text = None
            if record.exc_info:
                exception_text = "".join(traceback.format_exception(*record.exc_info)).strip()
            elif record.exc_text:
                exception_text = str(record.exc_text).strip()

            with _engine.begin() as connection:
                connection.execute(
                    insert(ApplicationLog).values(
                        created_at=int(record.created * 1000),
                        service=self.service_name,
                        level=record.levelname,
                        logger_name=record.name,
                        module=getattr(record, "module", None),
                        function=getattr(record, "funcName", None),
                        line_no=getattr(record, "lineno", None),
                        message=record.getMessage(),
                        exception=exception_text or None,
                        context={
                            "pathname": getattr(record, "pathname", None),
                            "filename": getattr(record, "filename", None),
                            "process": getattr(record, "processName", None),
                            "thread": getattr(record, "threadName", None),
                        },
                    )
                )
        except Exception:
            self.handleError(record)
        finally:
            self._local.active = False


def install_database_logging(service_name: str = "back_dispatcher") -> None:
    global _INSTALLED_HANDLER

    with _HANDLER_LOCK:
        if _INSTALLED_HANDLER is not None:
            return

        handler = DatabaseLogHandler(service_name=service_name)
        handler.setLevel(logging.INFO)

        root_logger = logging.getLogger()
        if root_logger.level > logging.INFO:
            root_logger.setLevel(logging.INFO)

        app_logger = logging.getLogger("app")
        if app_logger.level > logging.INFO:
            app_logger.setLevel(logging.INFO)

        active_loggers = [root_logger]
        for logger_obj in root_logger.manager.loggerDict.values():
            if isinstance(logger_obj, logging.Logger):
                active_loggers.append(logger_obj)

        for target_logger in active_loggers:
            if handler not in target_logger.handlers:
                target_logger.addHandler(handler)

        _INSTALLED_HANDLER = handler
        bootstrap_record = logging.LogRecord(
            name="app.logging_db",
            level=logging.INFO,
            pathname=__file__,
            lineno=0,
            msg="Database-backed logging enabled",
            args=(),
            exc_info=None,
        )
        handler.emit(bootstrap_record)
