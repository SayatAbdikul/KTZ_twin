from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import string
import time
from dataclasses import dataclass
from typing import Any, Literal
from uuid import uuid4

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import HTTPException, Request, Response, WebSocket
from fastapi.responses import JSONResponse
from sqlalchemy import or_, select, update

from app.config import (
    API_KEY,
    AUTH_ACCESS_TOKEN_TTL_S,
    AUTH_REFRESH_COOKIE_NAME,
    AUTH_REFRESH_COOKIE_SECURE,
    AUTH_REFRESH_TOKEN_TTL_S,
    AUTH_SEED_DEMO_USERS,
    AUTH_TOKEN_SECRET,
    BOOTSTRAP_ADMIN_DISPLAY_NAME,
    BOOTSTRAP_ADMIN_PASSWORD,
    BOOTSTRAP_ADMIN_USERNAME,
    DEMO_DISPATCHER_DISPLAY_NAME,
    DEMO_DISPATCHER_PASSWORD,
    DEMO_DISPATCHER_USERNAME,
    DEMO_TRAIN_DISPLAY_NAME,
    DEMO_TRAIN_LOCOMOTIVE_ID,
    DEMO_TRAIN_PASSWORD,
)
from app.db import session_scope
from app.db_models import AuthAuditEvent, AuthSession, User
from app.models import now_ms

UNAUTHORIZED_CODE = "UNAUTHORIZED"
FORBIDDEN_CODE = "FORBIDDEN"
PASSWORD_CHANGE_REQUIRED_CODE = "PASSWORD_CHANGE_REQUIRED"
COOKIE_PATH = "/"
USER_STATUS_ACTIVE = "active"
USER_STATUS_DISABLED = "disabled"
PUBLIC_PATHS = {
    "/api/auth/login",
    "/api/auth/refresh",
    "/api/auth/logout",
}
PASSWORD_CHANGE_ALLOWED_PATHS = {
    "/api/auth/me",
    "/api/auth/change-password",
    "/api/auth/logout",
    "/api/auth/refresh",
}
PASSWORD_MIN_LENGTH = 10
_PASSWORD_HASHER = PasswordHasher()


@dataclass(frozen=True)
class AuthContext:
    role: Literal["admin", "dispatcher", "train", "service"]
    subject: str
    user_id: int | None = None
    session_id: str | None = None
    username: str | None = None
    locomotive_id: str | None = None
    display_name: str | None = None
    status: str | None = None
    must_change_password: bool = False

    @property
    def is_service(self) -> bool:
        return self.role == "service"

    @property
    def is_admin(self) -> bool:
        return self.role in {"admin", "service"}

    @property
    def can_access_all_locomotives(self) -> bool:
        return self.role in {"admin", "dispatcher", "service"}

    @property
    def can_use_dispatcher_console(self) -> bool:
        return self.role in {"admin", "dispatcher", "service"}

    def can_access_locomotive(self, locomotive_id: str) -> bool:
        return self.can_access_all_locomotives or self.locomotive_id == locomotive_id


@dataclass(frozen=True)
class IssuedSession:
    access_token: str
    refresh_token: str
    auth: AuthContext


def _encode_segment(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _decode_segment(raw: str) -> bytes:
    padding = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(f"{raw}{padding}")


def _jwt_sign(signing_input: str) -> str:
    digest = hmac.new(AUTH_TOKEN_SECRET.encode("utf-8"), signing_input.encode("utf-8"), hashlib.sha256).digest()
    return _encode_segment(digest)


def _jwt_encode(payload: dict[str, object]) -> str:
    header = _encode_segment(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode("utf-8"))
    body = _encode_segment(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    signing_input = f"{header}.{body}"
    return f"{signing_input}.{_jwt_sign(signing_input)}"


def _jwt_decode(token: str) -> dict[str, object] | None:
    try:
        header, body, signature = token.split(".", 2)
    except ValueError:
        return None

    signing_input = f"{header}.{body}"
    if not hmac.compare_digest(signature, _jwt_sign(signing_input)):
        return None

    try:
        payload = json.loads(_decode_segment(body))
    except (ValueError, json.JSONDecodeError):
        return None

    exp = payload.get("exp")
    if not isinstance(exp, int) or exp <= int(time.time()):
        return None

    return payload


def _normalize_username(value: str | None) -> str | None:
    username = (value or "").strip().lower()
    return username or None


def _normalize_locomotive_id(value: str | None) -> str | None:
    locomotive_id = (value or "").strip().upper()
    return locomotive_id or None


def _password_hash(password: str) -> str:
    return _PASSWORD_HASHER.hash(password)


def _verify_password(password_hash: str, password: str) -> bool:
    try:
        return _PASSWORD_HASHER.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def _password_needs_rehash(password_hash: str) -> bool:
    try:
        return _PASSWORD_HASHER.check_needs_rehash(password_hash)
    except (VerificationError, InvalidHashError):
        return False


def _validate_new_password(password: str) -> str:
    candidate = password.strip()
    if len(candidate) < PASSWORD_MIN_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {PASSWORD_MIN_LENGTH} characters long.",
        )

    classes = [
        any(char.islower() for char in candidate),
        any(char.isupper() for char in candidate),
        any(char.isdigit() for char in candidate),
        any(not char.isalnum() for char in candidate),
    ]
    if sum(classes) < 3:
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least three of: lowercase, uppercase, number, symbol.",
        )
    return candidate


def _generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def _hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _generate_temporary_password(length: int = 16) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    while True:
        candidate = "".join(secrets.choice(alphabet) for _ in range(length))
        try:
            return _validate_new_password(candidate)
        except HTTPException:
            continue


def _context_from_user(user: User, session_id: str | None) -> AuthContext:
    return AuthContext(
        role=user.role,  # type: ignore[arg-type]
        subject=str(user.id),
        user_id=user.id,
        session_id=session_id,
        username=user.username,
        locomotive_id=user.locomotive_id,
        display_name=user.display_name,
        status=user.status,
        must_change_password=user.must_change_password,
    )


def serialize_auth_context(auth: AuthContext) -> dict[str, object]:
    return {
        "id": auth.user_id,
        "role": auth.role,
        "username": auth.username,
        "displayName": auth.display_name,
        "locomotiveId": auth.locomotive_id,
        "status": auth.status,
        "mustChangePassword": auth.must_change_password,
    }


def _serialize_user(user: User) -> dict[str, object]:
    return {
        "id": user.id,
        "role": user.role,
        "username": user.username,
        "displayName": user.display_name,
        "locomotiveId": user.locomotive_id,
        "status": user.status,
        "mustChangePassword": user.must_change_password,
        "createdAt": user.created_at,
        "updatedAt": user.updated_at,
        "lastLoginAt": user.last_login_at,
    }


def _record_audit_event(
    session,
    event_type: str,
    *,
    actor_user_id: int | None = None,
    subject_user_id: int | None = None,
    session_id: str | None = None,
    success: bool = True,
    payload: dict[str, object] | None = None,
) -> None:
    session.add(
        AuthAuditEvent(
            event_type=event_type,
            actor_user_id=actor_user_id,
            subject_user_id=subject_user_id,
            session_id=session_id,
            success=success,
            payload=payload or {},
            created_at=now_ms(),
        )
    )


def _service_context() -> AuthContext:
    return AuthContext(role="service", subject="service:api-key", display_name="Internal Service")


def create_access_token(auth: AuthContext) -> str:
    now_s = int(time.time())
    return _jwt_encode(
        {
            "sub": auth.subject,
            "uid": auth.user_id,
            "sid": auth.session_id,
            "role": auth.role,
            "username": auth.username,
            "locomotiveId": auth.locomotive_id,
            "displayName": auth.display_name,
            "status": auth.status,
            "mustChangePassword": auth.must_change_password,
            "iat": now_s,
            "exp": now_s + AUTH_ACCESS_TOKEN_TTL_S,
        }
    )


def _create_session_bundle(user: User, session_id: str, refresh_token: str) -> IssuedSession:
    auth = _context_from_user(user, session_id=session_id)
    return IssuedSession(
        access_token=create_access_token(auth),
        refresh_token=refresh_token,
        auth=auth,
    )


def _issue_session(
    session,
    user: User,
    *,
    user_agent: str | None,
    ip_address: str | None,
    revoke_existing: bool = False,
) -> IssuedSession:
    now = now_ms()
    if revoke_existing:
        session.execute(
            update(AuthSession)
            .where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
            .values(revoked_at=now, updated_at=now)
        )

    session_id = uuid4().hex
    refresh_token = _generate_refresh_token()
    session.add(
        AuthSession(
            session_id=session_id,
            user_id=user.id,
            refresh_token_hash=_hash_refresh_token(refresh_token),
            created_at=now,
            updated_at=now,
            expires_at=now + AUTH_REFRESH_TOKEN_TTL_S * 1000,
            revoked_at=None,
            user_agent=user_agent,
            ip_address=ip_address,
        )
    )
    return _create_session_bundle(user, session_id, refresh_token)


def _find_user_by_identifier(session, identifier: str) -> User | None:
    normalized = identifier.strip()
    if not normalized:
        return None
    locomotive_id = _normalize_locomotive_id(normalized)
    username = _normalize_username(normalized)
    return session.scalar(
        select(User).where(
            or_(
                User.username == username,
                User.locomotive_id == locomotive_id,
            )
        )
    )


def _find_session_by_refresh_token(session, refresh_token: str) -> AuthSession | None:
    refresh_hash = _hash_refresh_token(refresh_token)
    return session.scalar(select(AuthSession).where(AuthSession.refresh_token_hash == refresh_hash))


def _require_active_user(user: User | None) -> User:
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    if user.status != USER_STATUS_ACTIVE:
        raise HTTPException(status_code=403, detail="This account is disabled.")
    return user


def _require_active_session(auth_session: AuthSession | None) -> AuthSession:
    if auth_session is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    now = now_ms()
    if auth_session.revoked_at is not None or auth_session.expires_at <= now:
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")
    return auth_session


def _resolve_user_from_access_token(token: str) -> AuthContext | None:
    payload = _jwt_decode(token)
    if payload is None:
        return None

    role = payload.get("role")
    user_id = payload.get("uid")
    session_id = payload.get("sid")
    if role not in {"admin", "dispatcher", "train"}:
        return None
    if not isinstance(user_id, int) or not isinstance(session_id, str) or not session_id:
        return None

    with session_scope() as session:
        user = session.get(User, user_id)
        if user is None or user.status != USER_STATUS_ACTIVE:
            return None
        auth_session = session.scalar(
            select(AuthSession).where(
                AuthSession.session_id == session_id,
                AuthSession.user_id == user_id,
            )
        )
        if auth_session is None or auth_session.revoked_at is not None or auth_session.expires_at <= now_ms():
            return None
        return _context_from_user(user, session_id=session_id)


def _resolve_auth_context(authorization: str | None, api_key: str | None) -> AuthContext | None:
    if authorization:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() == "bearer" and token:
            decoded = _resolve_user_from_access_token(token.strip())
            if decoded is not None:
                return decoded

    if API_KEY and api_key == API_KEY:
        return _service_context()

    return None


def authenticate_credentials(identifier: str, password: str, *, user_agent: str | None, ip_address: str | None) -> IssuedSession:
    normalized_identifier = identifier.strip()
    if not normalized_identifier or not password:
        raise HTTPException(status_code=400, detail="Identifier and password are required.")

    with session_scope() as session:
        user = _find_user_by_identifier(session, normalized_identifier)
        if user is None:
            _record_audit_event(
                session,
                "login_failed",
                success=False,
                payload={"identifier": normalized_identifier, "reason": "user_not_found"},
            )
            raise HTTPException(status_code=401, detail="Invalid credentials.")

        if user.status != USER_STATUS_ACTIVE:
            _record_audit_event(
                session,
                "login_failed",
                subject_user_id=user.id,
                success=False,
                payload={"identifier": normalized_identifier, "reason": "disabled"},
            )
            raise HTTPException(status_code=403, detail="This account is disabled.")

        if not _verify_password(user.password_hash, password):
            _record_audit_event(
                session,
                "login_failed",
                subject_user_id=user.id,
                success=False,
                payload={"identifier": normalized_identifier, "reason": "invalid_password"},
            )
            raise HTTPException(status_code=401, detail="Invalid credentials.")

        if _password_needs_rehash(user.password_hash):
            user.password_hash = _password_hash(password)

        now = now_ms()
        user.last_login_at = now
        user.updated_at = now
        bundle = _issue_session(
            session,
            user,
            user_agent=user_agent,
            ip_address=ip_address,
        )
        _record_audit_event(
            session,
            "login_success",
            actor_user_id=user.id,
            subject_user_id=user.id,
            session_id=bundle.auth.session_id,
            payload={"identifier": normalized_identifier},
        )
        return bundle


def refresh_session(refresh_token: str | None, *, user_agent: str | None, ip_address: str | None) -> IssuedSession:
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh session not found.")

    with session_scope() as session:
        auth_session = _find_session_by_refresh_token(session, refresh_token)
        auth_session = _require_active_session(auth_session)
        user = _require_active_user(session.get(User, auth_session.user_id))

        rotated_refresh_token = _generate_refresh_token()
        auth_session.refresh_token_hash = _hash_refresh_token(rotated_refresh_token)
        auth_session.updated_at = now_ms()
        auth_session.expires_at = now_ms() + AUTH_REFRESH_TOKEN_TTL_S * 1000
        auth_session.user_agent = user_agent or auth_session.user_agent
        auth_session.ip_address = ip_address or auth_session.ip_address

        bundle = IssuedSession(
            access_token=create_access_token(_context_from_user(user, session_id=auth_session.session_id)),
            refresh_token=rotated_refresh_token,
            auth=_context_from_user(user, session_id=auth_session.session_id),
        )
        _record_audit_event(
            session,
            "refresh_success",
            actor_user_id=user.id,
            subject_user_id=user.id,
            session_id=auth_session.session_id,
        )
        return bundle


def logout_refresh_session(refresh_token: str | None) -> None:
    if not refresh_token:
        return

    with session_scope() as session:
        auth_session = _find_session_by_refresh_token(session, refresh_token)
        if auth_session is None or auth_session.revoked_at is not None:
            return

        auth_session.revoked_at = now_ms()
        auth_session.updated_at = now_ms()
        _record_audit_event(
            session,
            "logout",
            actor_user_id=auth_session.user_id,
            subject_user_id=auth_session.user_id,
            session_id=auth_session.session_id,
        )


def get_current_user(auth: AuthContext) -> dict[str, object]:
    if auth.user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    with session_scope() as session:
        user = _require_active_user(session.get(User, auth.user_id))
        return _serialize_user(user)


def change_password(
    auth: AuthContext,
    *,
    current_password: str,
    new_password: str,
    user_agent: str | None,
    ip_address: str | None,
) -> IssuedSession:
    if auth.user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    validated_password = _validate_new_password(new_password)
    with session_scope() as session:
        user = _require_active_user(session.get(User, auth.user_id))
        if not _verify_password(user.password_hash, current_password):
            _record_audit_event(
                session,
                "password_change_failed",
                actor_user_id=user.id,
                subject_user_id=user.id,
                session_id=auth.session_id,
                success=False,
                payload={"reason": "invalid_current_password"},
            )
            raise HTTPException(status_code=401, detail="Current password is incorrect.")

        now = now_ms()
        user.password_hash = _password_hash(validated_password)
        user.must_change_password = False
        user.updated_at = now

        bundle = _issue_session(
            session,
            user,
            user_agent=user_agent,
            ip_address=ip_address,
            revoke_existing=True,
        )
        _record_audit_event(
            session,
            "password_changed",
            actor_user_id=user.id,
            subject_user_id=user.id,
            session_id=bundle.auth.session_id,
        )
        return bundle


def list_users() -> list[dict[str, object]]:
    with session_scope() as session:
        users = session.scalars(select(User).order_by(User.role.asc(), User.display_name.asc(), User.id.asc())).all()
        return [_serialize_user(user) for user in users]


def create_user_account(
    actor: AuthContext,
    *,
    role: Literal["admin", "dispatcher", "train"],
    username: str | None,
    display_name: str,
    locomotive_id: str | None,
) -> dict[str, object]:
    require_admin(actor)

    normalized_role = role.strip().lower()
    normalized_username = _normalize_username(username)
    normalized_locomotive_id = _normalize_locomotive_id(locomotive_id)
    display = display_name.strip()
    if not display:
        raise HTTPException(status_code=400, detail="Display name is required.")

    if normalized_role not in {"admin", "dispatcher", "train"}:
        raise HTTPException(status_code=400, detail="Unsupported role.")
    if normalized_role == "train":
        if normalized_locomotive_id is None:
            raise HTTPException(status_code=400, detail="Train users require a locomotiveId.")
        normalized_username = None
    else:
        if normalized_username is None:
            raise HTTPException(status_code=400, detail="Admin and dispatcher users require a username.")
        normalized_locomotive_id = None

    temporary_password = _generate_temporary_password()
    now = now_ms()
    with session_scope() as session:
        if normalized_username is not None:
            existing_username = session.scalar(select(User).where(User.username == normalized_username))
            if existing_username is not None:
                raise HTTPException(status_code=409, detail="That username is already in use.")

        if normalized_locomotive_id is not None:
            existing_locomotive = session.scalar(select(User).where(User.locomotive_id == normalized_locomotive_id))
            if existing_locomotive is not None:
                raise HTTPException(status_code=409, detail="That locomotive already has an assigned train account.")

        user = User(
            role=normalized_role,
            username=normalized_username,
            display_name=display,
            locomotive_id=normalized_locomotive_id,
            password_hash=_password_hash(temporary_password),
            status=USER_STATUS_ACTIVE,
            must_change_password=True,
            created_at=now,
            updated_at=now,
            last_login_at=None,
        )
        session.add(user)
        session.flush()
        _record_audit_event(
            session,
            "user_created",
            actor_user_id=actor.user_id,
            subject_user_id=user.id,
            payload={"role": normalized_role},
        )
        return {
            "user": _serialize_user(user),
            "temporaryPassword": temporary_password,
        }


def update_user_account(
    actor: AuthContext,
    user_id: int,
    *,
    display_name: str | None,
    status: Literal["active", "disabled"] | None,
    locomotive_id: str | None,
) -> dict[str, object]:
    require_admin(actor)

    normalized_locomotive_id = _normalize_locomotive_id(locomotive_id)
    with session_scope() as session:
        user = session.get(User, user_id)
        if user is None:
            raise HTTPException(status_code=404, detail="User not found.")

        if user.id == actor.user_id and status == USER_STATUS_DISABLED:
            raise HTTPException(status_code=400, detail="You cannot disable your own account.")

        if display_name is not None:
            updated_display_name = display_name.strip()
            if not updated_display_name:
                raise HTTPException(status_code=400, detail="Display name cannot be empty.")
            user.display_name = updated_display_name

        if status is not None:
            if status not in {USER_STATUS_ACTIVE, USER_STATUS_DISABLED}:
                raise HTTPException(status_code=400, detail="Unsupported status.")
            user.status = status

        if user.role == "train":
            if locomotive_id is not None:
                if normalized_locomotive_id is None:
                    raise HTTPException(status_code=400, detail="Train users require a locomotiveId.")
                existing = session.scalar(
                    select(User).where(
                        User.locomotive_id == normalized_locomotive_id,
                        User.id != user.id,
                    )
                )
                if existing is not None:
                    raise HTTPException(status_code=409, detail="That locomotive already has an assigned train account.")
                user.locomotive_id = normalized_locomotive_id
        elif locomotive_id is not None:
            raise HTTPException(status_code=400, detail="Only train accounts can set locomotiveId.")

        user.updated_at = now_ms()
        if user.status == USER_STATUS_DISABLED:
            session.execute(
                update(AuthSession)
                .where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
                .values(revoked_at=now_ms(), updated_at=now_ms())
            )

        _record_audit_event(
            session,
            "user_updated",
            actor_user_id=actor.user_id,
            subject_user_id=user.id,
            payload={"status": user.status},
        )
        return _serialize_user(user)


def reset_user_password(actor: AuthContext, user_id: int) -> dict[str, object]:
    require_admin(actor)

    temporary_password = _generate_temporary_password()
    now = now_ms()
    with session_scope() as session:
        user = session.get(User, user_id)
        if user is None:
            raise HTTPException(status_code=404, detail="User not found.")

        user.password_hash = _password_hash(temporary_password)
        user.must_change_password = True
        user.updated_at = now
        session.execute(
            update(AuthSession)
            .where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
            .values(revoked_at=now, updated_at=now)
        )
        _record_audit_event(
            session,
            "password_reset",
            actor_user_id=actor.user_id,
            subject_user_id=user.id,
            payload={"mustChangePassword": True},
        )
        return {
            "user": _serialize_user(user),
            "temporaryPassword": temporary_password,
        }


def seed_auth_identities() -> None:
    now = now_ms()
    with session_scope() as session:
        bootstrap_username = _normalize_username(BOOTSTRAP_ADMIN_USERNAME)
        if bootstrap_username and session.scalar(select(User).where(User.username == bootstrap_username)) is None:
            session.add(
                User(
                    role="admin",
                    username=bootstrap_username,
                    display_name=BOOTSTRAP_ADMIN_DISPLAY_NAME,
                    locomotive_id=None,
                    password_hash=_password_hash(BOOTSTRAP_ADMIN_PASSWORD),
                    status=USER_STATUS_ACTIVE,
                    must_change_password=False,
                    created_at=now,
                    updated_at=now,
                    last_login_at=None,
                )
            )

        if not AUTH_SEED_DEMO_USERS:
            return

        dispatcher_username = _normalize_username(DEMO_DISPATCHER_USERNAME)
        if dispatcher_username and session.scalar(select(User).where(User.username == dispatcher_username)) is None:
            session.add(
                User(
                    role="dispatcher",
                    username=dispatcher_username,
                    display_name=DEMO_DISPATCHER_DISPLAY_NAME,
                    locomotive_id=None,
                    password_hash=_password_hash(DEMO_DISPATCHER_PASSWORD),
                    status=USER_STATUS_ACTIVE,
                    must_change_password=False,
                    created_at=now,
                    updated_at=now,
                    last_login_at=None,
                )
            )

        demo_locomotive_id = _normalize_locomotive_id(DEMO_TRAIN_LOCOMOTIVE_ID)
        if demo_locomotive_id and session.scalar(select(User).where(User.locomotive_id == demo_locomotive_id)) is None:
            session.add(
                User(
                    role="train",
                    username=None,
                    display_name=DEMO_TRAIN_DISPLAY_NAME,
                    locomotive_id=demo_locomotive_id,
                    password_hash=_password_hash(DEMO_TRAIN_PASSWORD),
                    status=USER_STATUS_ACTIVE,
                    must_change_password=False,
                    created_at=now,
                    updated_at=now,
                    last_login_at=None,
                )
            )


def set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key=AUTH_REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=AUTH_REFRESH_COOKIE_SECURE,
        samesite="lax",
        max_age=AUTH_REFRESH_TOKEN_TTL_S,
        path=COOKIE_PATH,
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=AUTH_REFRESH_COOKIE_NAME,
        path=COOKIE_PATH,
        httponly=True,
        secure=AUTH_REFRESH_COOKIE_SECURE,
        samesite="lax",
    )


def get_refresh_cookie(request: Request) -> str | None:
    return request.cookies.get(AUTH_REFRESH_COOKIE_NAME)


def auth_response_payload(bundle: IssuedSession) -> dict[str, object]:
    return {
        "accessToken": bundle.access_token,
        "user": serialize_auth_context(bundle.auth),
        "mustChangePassword": bundle.auth.must_change_password,
    }


def _json_error(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": code,
                "message": message,
            },
            "timestamp": now_ms(),
        },
    )


async def enforce_http_auth(request: Request, call_next):
    if request.method == "OPTIONS" or not request.url.path.startswith("/api"):
        return await call_next(request)

    if request.url.path in PUBLIC_PATHS:
        return await call_next(request)

    auth = _resolve_auth_context(
        request.headers.get("Authorization"),
        request.headers.get("X-API-Key"),
    )
    if auth is None:
        return _json_error(401, UNAUTHORIZED_CODE, "A valid bearer token is required for this endpoint.")

    if auth.must_change_password and request.url.path not in PASSWORD_CHANGE_ALLOWED_PATHS:
        return _json_error(
            403,
            PASSWORD_CHANGE_REQUIRED_CODE,
            "Password change is required before accessing the rest of the system.",
        )

    request.state.auth = auth
    return await call_next(request)


def get_request_auth(request: Request | WebSocket) -> AuthContext:
    auth = getattr(request.state, "auth", None)
    if isinstance(auth, AuthContext):
        return auth
    raise HTTPException(status_code=401, detail="Authentication context missing")


def require_admin(auth: AuthContext) -> None:
    if auth.is_admin:
        return
    raise HTTPException(status_code=403, detail="Admin role is required for this action.")


def require_dispatcher_access(auth: AuthContext) -> None:
    if auth.can_use_dispatcher_console:
        return
    raise HTTPException(status_code=403, detail="Dispatcher access is required for this action.")


def require_locomotive_access(auth: AuthContext, locomotive_id: str) -> None:
    if auth.can_access_locomotive(locomotive_id):
        return
    raise HTTPException(status_code=403, detail="You do not have access to this locomotive.")


async def authorize_websocket(websocket: WebSocket) -> AuthContext | None:
    auth = _resolve_auth_context(
        websocket.headers.get("Authorization"),
        websocket.query_params.get("apiKey"),
    )
    if auth is None:
        token = websocket.query_params.get("token")
        if token:
            auth = _resolve_user_from_access_token(token)

    if auth is None:
        await websocket.close(code=1008, reason="Unauthorized")
        return None

    if auth.must_change_password:
        await websocket.close(code=1008, reason="Password change required")
        return None

    websocket.state.auth = auth
    return auth
